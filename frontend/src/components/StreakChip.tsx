import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useAchievements, useMe } from "../lib/queries";

/**
 * Nav chip showing the daily streak + collector level.
 *
 * Mounting this on an authenticated page fetches /me, which registers today's activity for
 * the streak server-side; we then refresh the achievements query so the chip reflects it.
 */
export function StreakChip() {
  const qc = useQueryClient();
  const me = useMe();
  const ach = useAchievements();

  useEffect(() => {
    // /me bumped the streak on the server; pull the fresh value.
    if (me.isSuccess) qc.invalidateQueries({ queryKey: qk.achievements });
  }, [me.isSuccess, qc]);

  if (!ach.data) return null;
  const streak = ach.data.streak.current_streak;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        title="Collector level"
        className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
      >
        Lv {ach.data.level}
      </span>
      {streak > 0 && (
        <span title={`${streak}-day streak`} className="font-medium">
          🔥 {streak}
        </span>
      )}
    </div>
  );
}
