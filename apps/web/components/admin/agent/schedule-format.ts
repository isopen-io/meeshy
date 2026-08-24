/**
 * Presentation helpers shared by the agent scheduling surfaces
 * (`TriggerSchedulingModal`, `AgentScheduleTimeline`). Both panels render the
 * same schedule/budget data, so the clock, duration, and budget-band mappings
 * must stay identical — extracting them here keeps the two views from drifting
 * apart the way copy-pasted formatters silently do.
 */

/** Wall-clock hh:mm in the caller's locale (24h where the locale uses it). */
export function formatTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Human duration from milliseconds. A non-positive input clamps to `0min`: the
 * timeline feeds this signed deltas (`cooldownEndsAt - now`, `now - lastScan`)
 * that go negative the instant a countdown lapses, and a negative "-1min" reads
 * as broken.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0min';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Background class for a remaining-budget ratio (green > 0.6 > amber > 0.3 > red). */
export function budgetColor(ratio: number): string {
  if (ratio > 0.6) return 'bg-emerald-500';
  if (ratio > 0.3) return 'bg-amber-400';
  return 'bg-red-500';
}

/** Glow/shadow class mirroring {@link budgetColor}'s ratio bands. */
export function budgetGlow(ratio: number): string {
  if (ratio > 0.6) return 'shadow-emerald-500/30';
  if (ratio > 0.3) return 'shadow-amber-400/30';
  return 'shadow-red-500/30';
}
