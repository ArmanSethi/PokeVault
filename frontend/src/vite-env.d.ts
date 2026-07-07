/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional: may be unset at runtime, so callers must provide a fallback.
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
