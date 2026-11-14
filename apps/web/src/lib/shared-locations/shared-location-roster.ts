import {
  SHARED_LOCATION_DURATIONS_MINUTES,
  SHARED_LOCATION_PRECISIONS,
  type SharedLocationDurationMinutes,
  type SharedLocationPrecision,
} from '@meeshy/shared/types/shared-location-constants';

import type { SharedLocationRecipient } from './shared-location-sending';

/**
 * **À QUI JE MONTRE MA POSITION, À QUELLE PRÉCISION ET JUSQU'À QUAND** (#18345, iso
 * `apps/ios/.../SharedLocation/SharedLocationRoster.swift`). Le serveur ne connaît qu'UN
 * partage, dont la durée vaut pour toute la liste (1 h ou 8 h) ; la liste garde l'échéance
 * choisie pour CHAQUE personne, et le centre la retire du partage serveur à SON échéance.
 * Le terme serveur n'est jamais plus court que la plus lointaine des échéances, et c'est
 * lui qui coupe tout si l'onglet se tait. Les clés sont en minuscules.
 */

export type SharedLocationRosterEntry = { readonly precision: SharedLocationPrecision; readonly until: number };
export type SharedLocationRoster = Readonly<Record<string, SharedLocationRosterEntry>>;

export const EMPTY_ROSTER: SharedLocationRoster = Object.freeze({});

const [ONE_HOUR, EIGHT_HOURS] = SHARED_LOCATION_DURATIONS_MINUTES;
const MINUTE = 60_000;

const without = (roster: SharedLocationRoster, keep: (id: string, entry: SharedLocationRosterEntry) => boolean): SharedLocationRoster =>
  Object.fromEntries(Object.entries(roster).filter(([id, entry]) => keep(id, entry)));

export const rosterOps = {
  isEmpty: (roster: SharedLocationRoster): boolean => Object.keys(roster).length === 0,
  entry: (roster: SharedLocationRoster, userId: string): SharedLocationRosterEntry | null => roster[userId.toLowerCase()] ?? null,
  adding: (
    roster: SharedLocationRoster,
    { userId, precision, durationMinutes, now }: { readonly userId: string; readonly precision: SharedLocationPrecision; readonly durationMinutes: SharedLocationDurationMinutes; readonly now: number },
  ): SharedLocationRoster => ({ ...roster, [userId.toLowerCase()]: { precision, until: now + durationMinutes * MINUTE } }),
  removing: (roster: SharedLocationRoster, userId: string): SharedLocationRoster => without(roster, (id) => id !== userId.toLowerCase()),
  /** Ceux de `a` ET de `b`, `b` l'emportant : quand on ne sait pas laquelle des deux listes le serveur sert (accusé perdu). */
  union: (a: SharedLocationRoster, b: SharedLocationRoster): SharedLocationRoster => ({ ...a, ...b }),
  pruned: (roster: SharedLocationRoster, now: number): SharedLocationRoster => without(roster, (_, entry) => entry.until > now),
  /** La plus proche des échéances : le moment où la liste change d'elle-même. */
  nextDeadline: (roster: SharedLocationRoster): number | null => {
    const untils = Object.values(roster).map((entry) => entry.until);
    return untils.length === 0 ? null : Math.min(...untils);
  },
  /** La plus courte des durées servies qui couvre la plus lointaine des échéances. */
  serverDurationMinutes: (roster: SharedLocationRoster, now: number): SharedLocationDurationMinutes => {
    const farthest = Math.max(now, ...Object.values(roster).map((entry) => entry.until));
    return farthest - now <= ONE_HOUR * MINUTE ? ONE_HOUR : EIGHT_HOURS;
  },
  /** La liste telle que le serveur la reçoit, dans un ordre stable. */
  recipients: (roster: SharedLocationRoster): readonly SharedLocationRecipient[] =>
    Object.keys(roster)
      .sort()
      .map((userId) => ({ userId, precision: roster[userId]!.precision })),
};

const PRECISIONS: ReadonlySet<string> = new Set(SHARED_LOCATION_PRECISIONS);
const OBJECT_ID = /^[a-f0-9]{24}$/;

/** Ce qui survit au rechargement : identifiants, précisions, échéances — jamais une position. */
export const encodeSharedLocationRoster = (roster: SharedLocationRoster): string => JSON.stringify(roster);

/** Tolérant et fermé : une ligne illisible se saute, une précision inconnue se relit à la ville (on ouvre plus, jamais l'inverse). */
export function decodeSharedLocationRoster(text: string | null): SharedLocationRoster {
  if (text === null) return EMPTY_ROSTER;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return EMPTY_ROSTER;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_ROSTER;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
      const entry = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
      if (!OBJECT_ID.test(id) || entry === null || typeof entry.until !== 'number' || !Number.isFinite(entry.until)) return [];
      const precision = typeof entry.precision === 'string' && PRECISIONS.has(entry.precision) ? (entry.precision as SharedLocationPrecision) : 'city';
      return [[id, { precision, until: entry.until }] as const];
    }),
  );
}
