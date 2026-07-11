import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { money } from "../lib/format";

/** Currencies offered in Settings. Intl derives the symbol + decimals from the code. */
// eslint-disable-next-line react-refresh/only-export-components
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "CNY", label: "Chinese Yuan (¥)" },
  { code: "INR", label: "Indian Rupee (₹)" },
];
const CODES = new Set(CURRENCIES.map((c) => c.code));

// Free, no-key daily rates, USD-based. Cached in localStorage and refreshed once a day.
const FX_URL = "https://open.er-api.com/v6/latest/USD";
const FX_KEY = "pv-fx";
const CUR_KEY = "pv-currency";
const DAY_MS = 24 * 60 * 60 * 1000;

type Rates = Record<string, number>;

interface CurrencyState {
  currency: string;
  setCurrency: (code: string) => void;
  /** Format a USD value in the chosen currency (converted at the daily rate). */
  format: (usd: string | number | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyState | undefined>(undefined);

function initialCurrency(): string {
  const stored = localStorage.getItem(CUR_KEY);
  return stored && CODES.has(stored) ? stored : "USD";
}

function cachedRates(): Rates {
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (!raw) return { USD: 1 };
    const parsed = JSON.parse(raw) as { at: number; rates: Rates };
    return parsed.rates ?? { USD: 1 };
  } catch {
    return { USD: 1 };
  }
}

function cacheIsFresh(): boolean {
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { at: number };
    return Date.now() - parsed.at < DAY_MS;
  } catch {
    return false;
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(initialCurrency);
  const [rates, setRates] = useState<Rates>(cachedRates);

  useEffect(() => {
    if (cacheIsFresh()) return;
    let cancelled = false;
    fetch(FX_URL)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data?.result !== "success" || !data.rates) return;
        setRates(data.rates as Rates);
        localStorage.setItem(FX_KEY, JSON.stringify({ at: Date.now(), rates: data.rates }));
      })
      .catch(() => {
        /* Offline / rate-limited: keep whatever we have; USD always works (rate 1). */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setCurrency(code: string) {
    const next = CODES.has(code) ? code : "USD";
    setCurrencyState(next);
    localStorage.setItem(CUR_KEY, next);
  }

  // Rate = units of the chosen currency per 1 USD. Fail safe to 1 (shows USD-magnitude).
  const rate = currency === "USD" ? 1 : (rates[currency] ?? 1);

  function format(usd: string | number | null | undefined): string {
    if (usd === null || usd === undefined || usd === "") return money(null, currency);
    const n = typeof usd === "number" ? usd : Number(usd);
    if (Number.isNaN(n)) return "—";
    return money(n * rate, currency);
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency(): CurrencyState {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within <CurrencyProvider>");
  return ctx;
}
