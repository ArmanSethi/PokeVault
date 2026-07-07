# PokéVault — Frontend

React SPA for the PokéVault collection tracker.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · `pnpm`.

## Setup

```bash
cp .env.example .env          # VITE_API_URL points at the backend
pnpm install
```

## Run

```bash
pnpm dev        # dev server on http://localhost:5173
pnpm build      # type-check + production build to dist/
pnpm preview    # preview the production build
```

## Lint & format

```bash
pnpm lint
pnpm format
```

## Layout

```
src/
├── main.tsx        # React entry
├── App.tsx         # root component
├── index.css       # Tailwind directives
├── lib/            # api client and shared utilities
├── components/     # reusable UI
├── pages/          # route-level views
├── hooks/          # custom React hooks
└── types/          # shared TS types (mirror backend schemas)
```

## Environment

`VITE_API_URL` — base URL of the backend API (default `http://localhost:8000/api/v1`).
Only variables prefixed with `VITE_` are exposed to the client.
