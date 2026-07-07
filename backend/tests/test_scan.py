"""Tests for the free OCR card-scan pipeline.

Card photos are synthesized with Pillow (a name near the top, a collector number near the
bottom) so the tests are deterministic and need no sourced images. The OCR-dependent tests
skip if the Tesseract binary is not installed; ``parse_ocr`` is unit-tested without it.
"""

from __future__ import annotations

import io
from decimal import Decimal

import pytesseract
import pytest
from PIL import Image, ImageDraw, ImageFont

from app.core.config import settings
from app.models.card import Card, Set
from app.models.price import CardPriceCurrent
from app.services.scan import parse_ocr

_SCAN = f"{settings.API_V1_PREFIX}/scan"


def _tesseract_available() -> bool:
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:  # noqa: BLE001 - any failure means "no usable Tesseract here"
        return False


requires_tesseract = pytest.mark.skipif(
    not _tesseract_available(), reason="Tesseract binary not installed"
)


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in ("arial.ttf", "DejaVuSans.ttf", "C:\\Windows\\Fonts\\arial.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _card_image(name: str, number: str) -> bytes:
    """Render a simple card-like image OCR can read: name top, number bottom."""
    img = Image.new("RGB", (800, 1120), "white")
    draw = ImageDraw.Draw(img)
    draw.text((60, 60), name, fill="black", font=_font(72))
    draw.text((60, 1040), number, fill="black", font=_font(44))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _blank_image() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (800, 1120), "white").save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
async def scan_catalog(db_session):
    """A seeded set with distinct, unambiguous card names + prices (inside the test txn)."""
    # Fictional, catalog-unique names so fuzzy matching is deterministic even though the
    # endpoint's session also sees the full committed catalog (many real Charizards, etc.).
    db_session.add(Set(id="scn1", name="Scan Test Set", printed_total=4, total=4))
    db_session.add_all(
        [
            Card(
                id="scn1-4",
                set_id="scn1",
                name="Zzybax",
                number="4",
                image_small="http://img/zzybax.png",
            ),
            Card(id="scn1-2", set_id="scn1", name="Qwortle", number="2"),
            Card(id="scn1-15", set_id="scn1", name="Vexmoth", number="15"),
            Card(id="scn1-25", set_id="scn1", name="Plimpku", number="25"),
        ]
    )
    await db_session.flush()
    db_session.add(
        CardPriceCurrent(
            card_id="scn1-4",
            source="tcgplayer",
            variant="holofoil",
            market=Decimal("250.00"),
            currency="USD",
        )
    )
    await db_session.flush()


# ---- unit: parsing (no Tesseract needed) ---------------------------------


def test_parse_ocr_extracts_name_and_number():
    name, number = parse_ocr("Charizard\nStage 2\nHP 120\n\n4/102")
    assert number == "4"
    assert name is not None and "charizard" in name.lower()


def test_parse_ocr_empty_on_garbage():
    name, number = parse_ocr("\n  \n!!! ??? \n")
    assert name is None
    assert number is None


# ---- integration: OCR + match (needs Tesseract) --------------------------


@requires_tesseract
async def test_scan_clear_photo_ranks_correct_card(auth_client, scan_catalog):
    resp = await auth_client.post(
        _SCAN, files={"file": ("zzybax.png", _card_image("Zzybax", "4/102"), "image/png")}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["detected_number"] == "4"
    ids = [c["card_id"] for c in body["candidates"]]
    assert "scn1-4" in ids, body
    # The correct card should be the top candidate and carry its USD market price.
    top = body["candidates"][0]
    assert top["card_id"] == "scn1-4"
    assert top["confidence"] >= 0.6
    assert float(top["market_price"]) == 250.0
    assert top["currency"] == "USD"


@requires_tesseract
async def test_scan_blank_image_returns_no_candidates(auth_client, scan_catalog):
    resp = await auth_client.post(_SCAN, files={"file": ("blank.png", _blank_image(), "image/png")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["candidates"] == []


@requires_tesseract
async def test_scan_name_only_photo_still_matches(auth_client, scan_catalog):
    # No collector number rendered — must still fuzzy-match on name alone.
    resp = await auth_client.post(
        _SCAN, files={"file": ("qwortle.png", _card_image("Qwortle", ""), "image/png")}
    )
    assert resp.status_code == 200
    ids = [c["card_id"] for c in resp.json()["candidates"]]
    assert "scn1-2" in ids


async def test_scan_rejects_non_image(auth_client, scan_catalog):
    resp = await auth_client.post(
        _SCAN, files={"file": ("notes.txt", b"this is not an image", "text/plain")}
    )
    assert resp.status_code == 422


async def test_scan_rejects_empty_upload(auth_client, scan_catalog):
    resp = await auth_client.post(_SCAN, files={"file": ("empty.png", b"", "image/png")})
    assert resp.status_code == 422
