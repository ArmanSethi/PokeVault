/** Grade helpers — mirror of backend `app/services/grading.py` (`parse_psa_grade`).
 *
 * Only PSA grades carry a valuation premium (the multiplier table is PSA-only). Every other
 * company (BGS / CGC / SGC / Other) is valued at the raw, ungraded market price. These helpers
 * let the UI say so, so a non-PSA graded card isn't mistaken for being worth only raw. */

/** The PSA numeric grade (1–10) in a grade string like "PSA 10", else null. */
export function psaGrade(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const m = grade.match(/psa\s*([0-9]{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 10 ? n : null;
}

/** True when the stored grade earns a graded-value premium (PSA/BGS/CGC/SGC). */
export function gradedPremiumApplied(grade: string | null | undefined): boolean {
  return grade != null && /(?:psa|bgs|cgc|sgc)\s*[0-9]/i.test(grade);
}

/** True when a card is graded but shown at raw value (an "Other"/unlisted grader). */
export function gradedButRaw(grade: string | null | undefined): boolean {
  return Boolean(grade) && !gradedPremiumApplied(grade);
}

export const RAW_GRADE_NOTE =
  "Graded premium not applied — this grader isn't priced on the free tier, so it shows the ungraded (raw) market value.";
