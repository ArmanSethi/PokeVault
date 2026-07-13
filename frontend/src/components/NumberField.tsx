import { forwardRef, useEffect, useState } from "react";
import { clampInt, clampMoney } from "../lib/limits";

interface NumberFieldProps {
  /** Committed value: a number, or null (money fields only) when empty. */
  value: number | null;
  onCommit: (value: number | null) => void;
  kind: "int" | "money";
  min: number;
  max: number;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

/**
 * A clamped number input that edits RAW while typing (empty/partial allowed) and normalizes only
 * on blur + Enter — so clearing or partially editing the field never snaps to the min mid-keystroke.
 * On commit: int fields clamp to [min,max] and empty → min; money fields clamp via clampMoney and
 * empty → null. The backend still validates/clamps authoritatively.
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onCommit, kind, min, max, className, placeholder, ariaLabel, autoFocus },
  ref,
) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));
  // Reflect external resets (e.g. reopening the dialog on a different entry).
  useEffect(() => setRaw(value == null ? "" : String(value)), [value]);

  function commit() {
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (kind === "int") {
        onCommit(min);
        setRaw(String(min));
      } else {
        onCommit(null);
        setRaw("");
      }
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n)) {
      setRaw(value == null ? "" : String(value)); // revert to last committed
      return;
    }
    const norm = kind === "int" ? clampInt(n, min, max) : clampMoney(n);
    onCommit(norm);
    setRaw(String(norm));
  }

  return (
    <input
      ref={ref}
      type="number"
      inputMode={kind === "int" ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={kind === "money" ? "0.01" : "1"}
      value={raw}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className={className}
    />
  );
});
