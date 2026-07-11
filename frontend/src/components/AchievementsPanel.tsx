import { useAchievements } from "../lib/queries";

/** Badge grid + daily-streak summary — shown on the dashboard. */
export function AchievementsPanel() {
  const ach = useAchievements();
  if (!ach.data) return null;

  const { badges, streak } = ach.data;
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
