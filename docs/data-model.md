# Data model

This reflects the ORM models under `backend/app/models/`. The catalog schema mirrors
the [pokemontcg.io v2](https://api.pokemontcg.io/v2) API and is treated as the
**English** catalog (the v2 API does not expose non-English printings).

## Entities

### Set — `sets`

A released expansion. **Primary key is the pokemontcg.io string id** (e.g. `"sv3"`).

| Column          | Type      | Notes                                  |
| --------------- | --------- | -------------------------------------- |
| `id`            | str (PK)  | pokemontcg.io set id, e.g. `sv3`       |
| `name`          | str       |                                        |
| `series`        | str?      | e.g. "Scarlet & Violet"                |
| `printed_total` | int?      | count printed on the set               |
| `total`         | int?      | count incl. secret rares               |
| `release_date`  | date?     | parsed from `YYYY/MM/DD`               |
| `ptcgo_code`    | str?      | PTCGO/Live set code                    |
| `symbol_url`    | str?      | set symbol image                       |
| `logo_url`      | str?      | set logo image                         |

### Card — `cards`

A specific card printing within a set. **PK is the pokemontcg.io string id** (e.g.
`"sv3-125"`). The full API payload is retained in `raw_json` (JSONB) so new fields can
be derived later without re-fetching.

| Column                     | Type          | Notes                              |
| -------------------------- | ------------- | ---------------------------------- |
| `id`                       | str (PK)      | pokemontcg.io card id, `sv3-125`   |
| `set_id`                   | str (FK→sets) | `ON DELETE CASCADE`, indexed       |
| `name`                     | str           | indexed                            |
| `number`                   | str           | collector number within the set    |
| `supertype`                | str?          | Pokémon / Trainer / Energy         |
| `subtypes`                 | str[]?        | Postgres `ARRAY`                   |
| `rarity`                   | str?          |                                    |
| `artist`                   | str?          |                                    |
| `image_small`/`image_large`| str?         | card image URLs                    |
| `national_pokedex_numbers` | int[]?        | Postgres `ARRAY`                   |
| `tcgplayer_url`            | str?          | source listing URL                 |
| `cardmarket_url`           | str?          | source listing URL                 |
| `raw_json`                 | JSONB?        | full pokemontcg.io payload         |

### CollectionEntry — `collection_entries`

A card the owner holds, with copy-level detail. (Multi-user is not modeled yet — add a
`User` entity and `user_id` FK when auth lands.)

| Column           | Type            | Notes                        |
| ---------------- | --------------- | ---------------------------- |
| `id`             | int (PK)        | autoincrement                |
| `card_id`        | str (FK→cards)  | `ON DELETE CASCADE`, indexed |
| `quantity`       | int             | default 1                    |
| `condition`      | str?            | e.g. NM, LP, MP              |
| `is_foil`        | bool            | default false                |
| `variant`        | str?            | printing owned (holofoil, reverseHolofoil, …); drives value |
| `created_at`     | datetime        | server default `now()`       |
| `updated_at`     | datetime        | `now()` + `onupdate`         |

### CardPriceCurrent — `card_prices_current`

Latest price snapshot only, one row per **(card, source, variant)** — that triple is the
composite primary key, so an upsert keeps exactly one current row per combination.

| Column       | Type            | Notes                                        |
| ------------ | --------------- | -------------------------------------------- |
| `card_id`    | str (PK, FK)    | `ON DELETE CASCADE`                          |
| `source`     | str (PK)        | `tcgplayer` \| `cardmarket`                  |
| `variant`    | str (PK)        | e.g. `normal`, `holofoil`, `reverseHolofoil` |
| `low`/`mid`/`high`/`market`/`direct_low` | Numeric(10,2)? | from the source's price block |
| `currency`   | str             | `USD` (tcgplayer) / `EUR` (cardmarket)       |
| `updated_at` | datetime (tz)   | stamped on every upsert                      |

### PriceHistory — `price_history`

One market-price observation per **(card, source, variant, day)** for trend charts
(unique constraint on those four columns). **Not yet populated** — the model and the
`Card.price_history` relationship exist, but `sync_catalog.py` currently writes only
`CardPriceCurrent`. Backfilling history is a future task.

| Column          | Type            | Notes                       |
| --------------- | --------------- | --------------------------- |
| `id`            | bigint (PK)     | autoincrement               |
| `card_id`       | str (FK→cards)  | `ON DELETE CASCADE`, indexed|
| `source`        | str             | `tcgplayer` \| `cardmarket` |
| `variant`       | str             |                             |
| `market_price`  | Numeric(10,2)?  |                             |
| `currency`      | str             | default `USD`               |
| `snapshot_date` | date            | indexed; part of unique key |

## Relationships

```
Set 1──▶∞ Card ┬─▶∞ CollectionEntry
               ├─▶∞ CardPriceCurrent   (one per source × variant)
               └─▶∞ PriceHistory       (one per source × variant × day)
```

## Ingestion

The catalog and current prices are populated by `app/ingest/` (see
[architecture](architecture.md)):

- `client.py` — async pokemontcg.io v2 client: `X-Api-Key` auth, `pageSize=250`
  pagination, exponential backoff on 429/5xx (honoring `Retry-After`), keyless
  fallback at reduced rate limits.
- `mappers.py` — pure functions mapping API JSON → ORM column values
  (`set_to_values`, `card_to_values`, `price_rows_from_card`). No DB/session concerns,
  so they unit-test trivially.
- `sync_catalog.py` — orchestrates a full sync via idempotent
  `INSERT ... ON CONFLICT DO UPDATE`, committing per set (so an interrupted run resumes
  cleanly). CLI flags: `--start-at`, `--sets`, `--page-size`, `--dry-run`.

```bash
python -m app.ingest.sync_catalog                 # full sync
python -m app.ingest.sync_catalog --sets sv3,sv4  # only these sets
python -m app.ingest.sync_catalog --dry-run       # fetch + map, no DB writes
```

### Price mapping notes

- **tcgplayer** → one row per variant (`normal`, `holofoil`, `reverseHolofoil`, …), USD,
  with `low`/`mid`/`high`/`market`/`direct_low`.
- **cardmarket** → a single flat block (no variant breakdown) → one `normal` row, EUR;
  `market` uses `trendPrice`, falling back to `averageSellPrice`; `low` uses `lowPrice`.

## Notes

- Pricing/valuation for a user's collection will combine `CollectionEntry` with the
  matching `CardPriceCurrent` row(s); the exact variant/source selection is TBD.
- User ownership (multi-user) is not modeled yet; add a `User` entity and a `user_id`
  FK on `CollectionEntry` when auth lands.
