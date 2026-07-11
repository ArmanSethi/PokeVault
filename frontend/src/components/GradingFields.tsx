import { useState } from "react";

/** Grade/condition input shared by the add (CardDetailPage) and edit (CollectionPage) forms.
 *
 * A card is either raw (has a Condition) or graded (has a grading Company + Grade) — never both.
 * The selection is encoded into the single `grade` string the backend already stores, e.g.
 * "PSA 10", "BGS 9.5" (no separate grading_company column). Only PSA grades carry a valuation
 * premium today (the multiplier table is PSA-only); other companies display raw value.
 */

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];
export const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "SGC", "Other"] as const;

// Standard grade scales, highest first.
const FULL_SCALE = [
  "10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5",
  "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1",
];
// PSA uses whole grades plus the half-grade 1.5.
const PSA_SCALE = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1.5", "1"];

const scaleFor = (company: string): string[] => (company === "PSA" ? PSA_SCALE : FULL_SCALE);
const gradeLabel = (v: string): string => (v === "10" ? "10 (Gem Mint)" : v);

/** Split a stored grade string into company + value; null when ungraded. */
function parseGrade(grade: string): { company: string; value: string } | null {
  const g = grade.trim();
  if (!g) return null;
  const m = g.match(/^(PSA|BGS|CGC|SGC|Other)\s+(.+)$/i);
  if (m) {
    const company = GRADING_COMPANIES.find((c) => c.toLowerCase() === m[1].toLowerCase()) ?? "Other";
    return { company, value: m[2].trim() };
  }
  return { company: "Other", value: g }; // legacy free-text grade
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800";

interface Props {
  condition: string;
  grade: string;
  onChange: (next: { condition: string; grade: string }) => void;
}

export function GradingFields({ condition, grade, onChange }: Props) {
  const parsed = parseGrade(grade);
  const [graded, setGraded] = useState(parsed !== null);
  const [company, setCompany] = useState(parsed?.company ?? "PSA");
  const [value, setValue] = useState(parsed?.value ?? "10");
  const [cond, setCond] = useState(condition);

  const emitGraded = (c: string, v: string) => onChange({ condition: "", grade: `${c} ${v}` });

  function toggle(next: boolean) {
    setGraded(next);
    if (next) {
      const v = scaleFor(company).includes(value) ? value : scaleFor(company)[0];
      setValue(v);
      emitGraded(company, v);
    } else {
      onChange({ condition: cond, grade: "" });
    }
  }

  function changeCompany(c: string) {
    setCompany(c);
    const v = scaleFor(c).includes(value) ? value : scaleFor(c)[0];
    setValue(v);
    emitGraded(c, v);
  }

  function changeValue(v: string) {
    setValue(v);
    emitGraded(company, v);
  }

  function changeCond(c: string) {
    setCond(c);
    onChange({ condition: c, grade: "" });
  }

  return (
    <div className="col-span-2 space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={graded} onChange={(e) => toggle(e.target.checked)} />
        Graded card
      </label>

      {graded ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block">Grading company</span>
            <select
              value={company}
              onChange={(e) => changeCompany(e.target.value)}
              className={inputClass}
            >
              {GRADING_COMPANIES.map((c) => (
                <option key={c} value={c}>
                  {c === "BGS" ? "BGS (Beckett)" : c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block">Grade</span>
            <select
              value={value}
              onChange={(e) => changeValue(e.target.value)}
              className={inputClass}
            >
              {scaleFor(company).map((v) => (
                <option key={v} value={v}>
                  {gradeLabel(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block">Condition</span>
          <select value={cond} onChange={(e) => changeCond(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
