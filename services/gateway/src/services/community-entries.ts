/**
 * Les entrées d'une communauté (#19429) : qui les voit, et ce qu'elles disent.
 *
 * Une seule porte décide qui lit la source, le pays et les comptes d'entrée :
 * `isCommunitySteward` — le créateur, un administrateur ou un modérateur ACTIF
 * de la communauté. Les routes de liste, de comptes et de demandes la
 * partagent ; aucune ne réécrit la boucle.
 */

export type CommunityJoinVia = 'self' | 'invited' | 'link';

export const ENTRY_WINDOW_DAYS = 30;
/** La série quotidienne se lit sur au plus ce nombre d'arrivées récentes ; les comptes, eux, restent exacts. */
export const ENTRY_SERIES_SAMPLE_CAP = 10_000;
const WEEK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CommunityStewardshipSource = {
  readonly createdBy: string;
  readonly members: readonly { readonly userId: string; readonly role?: string | null }[];
};

export function isCommunitySteward(community: CommunityStewardshipSource, viewerId: string): boolean {
  if (community.createdBy === viewerId) return true;
  return community.members.some(
    (member) => member.userId === viewerId && (member.role === 'admin' || member.role === 'moderator'),
  );
}

export type CommunityEntryStats = {
  readonly last7: number;
  readonly last30: number;
  readonly series30: readonly { readonly day: string; readonly count: number }[];
  readonly viaLink: number;
};

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

const startOfUtcDay = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Le premier instant de la fenêtre de `days` jours calendaires UTC, aujourd'hui compris. */
export function entryWindowStart(now: Date, days: number = ENTRY_WINDOW_DAYS): Date {
  return new Date(startOfUtcDay(now) - (days - 1) * DAY_MS);
}

export function computeCommunityEntryStats(input: {
  readonly joinedAt: readonly Date[];
  readonly viaLink: number;
  readonly now: Date;
}): CommunityEntryStats {
  const days = Array.from({ length: ENTRY_WINDOW_DAYS }, (_, index) =>
    utcDay(new Date(entryWindowStart(input.now).getTime() + index * DAY_MS)),
  );
  const entryDays = input.joinedAt
    .filter((at) => at.getTime() <= input.now.getTime())
    .map(utcDay);
  const series30 = days.map((day) => ({ day, count: entryDays.filter((entryDay) => entryDay === day).length }));
  const sumLast = (n: number): number => series30.slice(-n).reduce((sum, bucket) => sum + bucket.count, 0);
  return { last7: sumLast(WEEK_DAYS), last30: sumLast(ENTRY_WINDOW_DAYS), series30, viaLink: input.viaLink };
}
