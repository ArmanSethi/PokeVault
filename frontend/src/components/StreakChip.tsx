import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useAchievements, useMe } from "../lib/queries";

/**
 * Nav chip showing the daily streak (🔥).
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
  if (streak <= 0) return null;

  return (
    <span title={`${streak}-day streak`} className="text-sm font-medium">
      🔥 {streak}
    </span>
  );
}
