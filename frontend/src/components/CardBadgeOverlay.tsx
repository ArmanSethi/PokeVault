import { RAW_GRADE_NOTE, gradedButRaw } from "../lib/grading";

/**
 * Foil / quantity / grade badges overlaid on a collection card's image. Shared by the owner's
 * Collection grid and the public showcase so both render the same badges the same way (see the
 * public profile: "real collection, not sim vault"). Purely presentational — the parent owns the
 * image box and any link.
 */
export function CardBadgeOverlay({
  isFoil,
  quantity,
  grade,
}: {
  isFoil: boolean;
  quantity: number;
  grade?: string | null;
}) {
  return (
    <>
      {isFoil && <span className="absolute left-1.5 top-1.5 text-xs text-accent-400">✦</span>}
      <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white shadow">
          ×{quantity}
        </span>
        {grade && (
          <span
            title={gradedButRaw(grade) ? RAW_GRADE_NOTE : undefined}
            className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white"
          >
            {grade}
          </span>
        )}
      </div>
    </>
  );
}
