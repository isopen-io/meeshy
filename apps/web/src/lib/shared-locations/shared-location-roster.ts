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
export type SharedLocationRoster = {
  readonly entries: Readonly<Record<string, SharedLocationRosterEntry>>;
  /** Les personnes retirées que le serveur peut encore servir, et jusqu'à quand il le pourrait au plus. */
  readonly withdrawals: Readonly<Record<string, number>>;
};

const [ONE_HOUR, EIGHT_HOURS] = SHARED_LOCATION_DURATIONS_MINUTES;
const MINUTE = 60_000;

/** Une personne présente dans la liste n'a jamais de retrait en attente. */
const rosterOf = (entries: SharedLocationRoster['entries'], withdrawals: SharedLocationRoster['withdrawals'] = {}): SharedLocationRoster =>
  Object.freeze({ entries, withdrawals: Object.fromEntries(Object.entries(withdrawals).filter(([id]) => !(id in entries))) });

export const EMPTY_ROSTER: SharedLocationRoster = rosterOf({});

const filtered = <T>(record: Readonly<Record<string, T>>, keep: (id: string, value: T) => boolean): Readonly<Record<string, T>> =>
  Object.fromEntries(Object.entries(record).filter(([id, value]) => keep(id, value)));

const sameRecord = <T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>, same: (x: T, y: T) => boolean): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, value]) => id in b && same(value, b[id]!));

/*
 * Un « Arrêter » qui n'a pas pu partir (hors ligne, accusé perdu) devient un RETRAIT EN ATTENTE (#18388, iso #18204) :
 * la personne sort de la liste, son identifiant reste gardé jusqu'à ce que le serveur ait reçu une liste sans elle, au
 * plus huit heures (aucun partage serveur ne court plus longtemps qu'un `start` de 8 h). C'est le centre qui rejoue
 * l'intention, jamais le doigt.
 */
export const rosterOps = {
  /** Rien à garder : personne à qui montrer ma position, aucun retrait à faire partir. */
  isEmpty: (roster: SharedLocationRoster): boolean => !rosterOps.hasRecipients(roster) && !rosterOps.hasPendingWithdrawals(roster),
  /** Au moins une personne voit ma position : c'est seulement alors que l'onglet a des relevés à envoyer. */
  hasRecipients: (roster: SharedLocationRoster): boolean => Object.keys(roster.entries).length > 0,
  hasPendingWithdrawals: (roster: SharedLocationRoster): boolean => Object.keys(roster.withdrawals).length > 0,
  isWithdrawalPending: (roster: SharedLocationRoster, userId: string): boolean => userId.toLowerCase() in roster.withdrawals,
  entry: (roster: SharedLocationRoster, userId: string): SharedLocationRosterEntry | null => roster.entries[userId.toLowerCase()] ?? null,
  adding: (
    roster: SharedLocationRoster,
    { userId, precision, durationMinutes, now }: { readonly userId: string; readonly precision: SharedLocationPrecision; readonly durationMinutes: SharedLocationDurationMinutes; readonly now: number },
  ): SharedLocationRoster => rosterOf({ ...roster.entries, [userId.toLowerCase()]: { precision, until: now + durationMinutes * MINUTE } }, roster.withdrawals),
  removing: (roster: SharedLocationRoster, userId: string): SharedLocationRoster =>
    rosterOf(filtered(roster.entries, (id) => id !== userId.toLowerCase()), roster.withdrawals),
  /** « Arrêter » n'a pas pu partir : la personne sort et son retrait attend le réseau, au plus jusqu'au terme serveur le plus long. */
  withdrawing: (roster: SharedLocationRoster, userId: string, now: number): SharedLocationRoster => {
    const id = userId.toLowerCase();
    if (!(id in roster.entries)) return roster;
    return rosterOf(filtered(roster.entries, (other) => other !== id), { ...roster.withdrawals, [id]: now + EIGHT_HOURS * MINUTE });
  },
  /** La liste que le serveur doit recevoir : la même, sans retrait en attente — l'envoyer les solde tous. */
  settled: (roster: SharedLocationRoster): SharedLocationRoster => rosterOf(roster.entries),
  /** Ceux de `a` ET de `b`, `b` l'emportant : quand on ne sait pas laquelle des deux listes le serveur sert (accusé perdu). */
  union: (a: SharedLocationRoster, b: SharedLocationRoster): SharedLocationRoster =>
    rosterOf(
      { ...a.entries, ...b.entries },
      Object.fromEntries([...new Set([...Object.keys(a.withdrawals), ...Object.keys(b.withdrawals)])].map((id) => [id, Math.max(a.withdrawals[id] ?? 0, b.withdrawals[id] ?? 0)])),
    ),
  /** Sans ceux dont l'échéance est passée, ni les retraits que plus aucun partage serveur ne peut servir. */
  pruned: (roster: SharedLocationRoster, now: number): SharedLocationRoster =>
    rosterOf(
      filtered(roster.entries, (_, entry) => entry.until > now),
      filtered(roster.withdrawals, (_, until) => until > now),
    ),
  /** Ce que le serveur sert est-il exactement ce que je veux : aucune échéance passée, aucun retrait en attente ? */
  isSettled: (roster: SharedLocationRoster, now: number): boolean => rosterOps.equals(rosterOps.settled(rosterOps.pruned(roster, now)), roster),
  equals: (a: SharedLocationRoster, b: SharedLocationRoster): boolean =>
    sameRecord(a.entries, b.entries, (x, y) => x.precision === y.precision && x.until === y.until) && sameRecord(a.withdrawals, b.withdrawals, (x, y) => x === y),
  /** La plus proche des échéances : le moment où la liste change d'elle-même. */
  nextDeadline: (roster: SharedLocationRoster): number | null => {
    const untils = Object.values(roster.entries).map((entry) => entry.until);
    return untils.length === 0 ? null : Math.min(...untils);
  },
  /** La plus courte des durées servies qui couvre la plus lointaine des échéances. */
  serverDurationMinutes: (roster: SharedLocationRoster, now: number): SharedLocationDurationMinutes => {
    const farthest = Math.max(now, ...Object.values(roster.entries).map((entry) => entry.until));
    return farthest - now <= ONE_HOUR * MINUTE ? ONE_HOUR : EIGHT_HOURS;
  },
  /** La liste telle que le serveur la reçoit, dans un ordre stable. */
  recipients: (roster: SharedLocationRoster): readonly SharedLocationRecipient[] =>
    Object.keys(roster.entries)
      .sort()
      .map((userId) => ({ userId, precision: roster.entries[userId]!.precision })),
};

const PRECISIONS: ReadonlySet<string> = new Set(SHARED_LOCATION_PRECISIONS);
const OBJECT_ID = /^[a-f0-9]{24}$/;

/*
 * La clé des retraits n'est pas un identifiant : une version d'avant #18388 relit la même liste en la sautant (elle
 * perd le retrait en attente, jamais une personne), et une liste d'avant se relit sans retrait.
 */
const WITHDRAWALS_KEY = 'withdrawals';

/** Ce qui survit au rechargement : identifiants, précisions, échéances et bornes de retrait — jamais une position. */
export const encodeSharedLocationRoster = (roster: SharedLocationRoster): string =>
  JSON.stringify(rosterOps.hasPendingWithdrawals(roster) ? { ...roster.entries, [WITHDRAWALS_KEY]: roster.withdrawals } : roster.entries);

const objectOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Tolérant et fermé : une ligne illisible se saute, une précision inconnue se relit à la ville (on ouvre plus, jamais l'inverse). */
export function decodeSharedLocationRoster(text: string | null): SharedLocationRoster {
  if (text === null) return EMPTY_ROSTER;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return EMPTY_ROSTER;
  }
  const raw = objectOf(parsed);
  if (raw === null) return EMPTY_ROSTER;
  const entries = Object.fromEntries(
    Object.entries(raw).flatMap(([id, value]) => {
      const entry = objectOf(value);
      if (!OBJECT_ID.test(id) || entry === null || !finite(entry.until)) return [];
      const precision = typeof entry.precision === 'string' && PRECISIONS.has(entry.precision) ? (entry.precision as SharedLocationPrecision) : 'city';
      return [[id, { precision, until: entry.until }] as const];
    }),
  );
  const withdrawals = Object.fromEntries(
    Object.entries(objectOf(raw[WITHDRAWALS_KEY]) ?? {}).flatMap(([id, until]) => (OBJECT_ID.test(id) && finite(until) ? [[id, until] as const] : [])),
  );
  return rosterOf(entries, withdrawals);
}
