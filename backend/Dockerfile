# Production image for the PokéVault backend.
#
# Uses the official uv base (Python 3.11 on Debian slim, uv preinstalled) and adds the
# Tesseract OCR binary so the /scan endpoint works in production — the whole reason this
# image exists rather than Render's native Python runtime (which has no Tesseract).
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# System OCR engine (+ English language data ships with the tesseract-ocr package).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Install dependencies in their own cached layer (no app code yet) so code changes
#    don't bust the dependency cache. --no-dev drops ruff/pytest from the prod image.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# 2) Copy the application and install the project itself.
COPY . .
RUN uv sync --frozen --no-dev

# Put the venv on PATH so `uvicorn` runs without the `uv run` wrapper at startup.
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Render (and most PaaS) inject $PORT; default to 8000 for local runs.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
