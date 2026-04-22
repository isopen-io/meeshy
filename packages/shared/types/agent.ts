export type AgentType =
  | 'personal'
  | 'support'
  | 'faq'
  | 'animator'
  | 'commercial'
  | 'tutor'
  | 'manager'
  | 'leader'
  | 'journalist'
  | 'analyst'
  | 'moderator';

export const AGENT_TYPES: readonly AgentType[] = [
  'personal',
  'support',
  'faq',
  'animator',
  'commercial',
  'tutor',
  'manager',
  'leader',
  'journalist',
  'analyst',
  'moderator',
] as const;

/// Maximum duration a scan can be "in progress" before it's considered stale
/// (e.g. agent service crashed / exception escaped cleanup) and forcibly treated
/// as stopped by the read path. 3 minutes covers the worst-case LangGraph run
/// (observe → strategist → generator → qualityGate) with margin for slow LLMs.
export const SCAN_STALE_MS = 3 * 60 * 1000;

export function isScanActive(scanStartedAt: Date | string | null | undefined, now: number = Date.now()): boolean {
  if (!scanStartedAt) return false;
  const started = typeof scanStartedAt === 'string' ? Date.parse(scanStartedAt) : scanStartedAt.getTime();
  if (!Number.isFinite(started)) return false;
  return now - started < SCAN_STALE_MS;
}
