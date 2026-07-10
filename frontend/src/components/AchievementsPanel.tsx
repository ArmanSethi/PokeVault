import { useAchievements } from "../lib/queries";

/** Collector level, XP progress bar, and the badge grid — shown on the dashboard. */
export function AchievementsPanel() {
  const ach = useAchievements();
  if (!ach.data) return null;

  const { level, xp_into_level, xp_for_next, badges, streak } = ach.data;
  const progress = Math.min(100, Math.round((xp_into_level / xp_for_next) * 100));
  const earned = badges.filter((b) => b.earned).length;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Achievements</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {earned}/{badges.length} badges
          {streak.current_streak > 0 && <> · 🔥 {streak.current_streak}-day streak</>}
        </span>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-semibold">Level {level}</span>
          <span className="text-slate-500 dark:text-slate-400">
            {xp_into_level} / {xp_for_next} XP
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {badges.map((b) => (
          <div
            key={b.id}
            title={b.description}
            className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
              b.earned
                ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/20"
                : "border-slate-200 opacity-50 dark:border-slate-800"
            }`}
          >
            <span className="text-2xl" aria-hidden>
              {b.icon}
            </span>
            <span className="text-xs font-medium">{b.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
