import {
  SHARED_LOCATION_DURATIONS_MINUTES,
  SHARED_LOCATION_PRECISIONS,
  type SharedLocationDurationMinutes,
  type SharedLocationPrecision,
} from '@meeshy/shared/types/shared-location-constants';

import type { SharedLocationOwnSnapshot } from '@meeshy/shared/types/shared-location';

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
const SECOND = 1_000;
/** L'écart que l'horloge de l'appareil, celle de la passerelle et l'arrondi à la seconde peuvent creuser entre deux échéances d'un même partage. */
export const SHARED_LOCATION_CLOCK_SLACK_MS = 5 * MINUTE;

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
  /**
   * La liste recalée sur le partage que la passerelle SERT (#18389) : elle seule sait ce qu'un autre appareil du
   * compte a ajouté, prolongé ou retiré. Ses personnes, à la précision et à l'échéance servies ; une personne en
   * retrait ICI n'est jamais reprise (le retrait se rejoue), et un retrait que le serveur ne sert déjà plus est
   * soldé. Une personne servie déjà échue n'est pas reprise.
   */
  withServed: (roster: SharedLocationRoster, served: SharedLocationOwnSnapshot, now: number): SharedLocationRoster => {
    const servedIds = new Set(served.recipients.map((recipient) => recipient.userId.toLowerCase()));
    const entries = Object.fromEntries(
      served.recipients.flatMap((recipient) => {
        const id = recipient.userId.toLowerCase();
        const until = Date.parse(recipient.expiresAt);
        if (!OBJECT_ID.test(id) || !Number.isFinite(until) || until <= now || id in roster.withdrawals) return [];
        const precision = PRECISIONS.has(recipient.precision) ? recipient.precision : 'city';
        return [[id, { precision, until }] as const];
      }),
    );
    return rosterOf(entries, filtered(roster.withdrawals, (id) => servedIds.has(id)));
  },
  /**
   * `next` montre-t-il PLUS que `before` (#18580) : une personne de plus, une autre précision, une échéance repoussée
   * au-delà du jeu des horloges ? Seul un « Partager » le fait — un retrait ou une échéance passe par la liste seule. Lu
   * sur la liste servie, c'est le signe qu'un autre appareil a partagé après celui-ci, et que c'est lui qui publie.
   */
  gainedOver: (before: SharedLocationRoster, next: SharedLocationRoster): boolean =>
    Object.entries(next.entries).some(([id, entry]) => {
      const kept = before.entries[id];
      return kept === undefined || kept.precision !== entry.precision || entry.until - kept.until > SHARED_LOCATION_CLOCK_SLACK_MS;
    }),
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
  /**
   * La liste telle que le serveur la reçoit, avec l'échéance de chaque personne qui tombe AVANT le terme du partage :
   * la passerelle la tient, même onglet fermé (#18205). Arrondie à la seconde au-dessus, jamais nulle ; une personne
   * échue pendant l'attente d'un relevé ne part plus du tout.
   *
   * « Avant le terme » se juge À LA SECONDE, l'unité dans laquelle l'échéance voyage (#18539) : l'attente du relevé
   * sépare toujours l'ajout de la publication de quelques millisecondes, et les comparer faisait partir, pour un
   * partage d'une heure avec une seule personne, une échéance égale au terme.
   */
  deadlinedRecipients: (roster: SharedLocationRoster, now: number): readonly SharedLocationRecipient[] => {
    const termSeconds = (rosterOps.serverDurationMinutes(roster, now) * MINUTE) / SECOND;
    return rosterOps.recipients(rosterOps.pruned(roster, now)).map((recipient) => {
      const expiresInSeconds = Math.max(1, Math.ceil((roster.entries[recipient.userId]!.until - now) / SECOND));
      return expiresInSeconds < termSeconds ? { ...recipient, expiresInSeconds } : recipient;
    });
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
 * Les retraits vivent sous une clé À PART (`<clé>.withdrawals`) : un onglet d'une version d'avant #18388 ne la lit ni ne
 * l'écrit, donc ne peut pas l'effacer en réécrivant la liste ; la liste elle-même garde le format d'avant.
 */
export const sharedLocationWithdrawalsKey = (storageKey: string): string => `${storageKey}.withdrawals`;

/** Ce qui survit au rechargement : identifiants, précisions et échéances — jamais une position. */
export const encodeSharedLocationRoster = (roster: SharedLocationRoster): string => JSON.stringify(roster.entries);

/** Les retraits en attente : identifiants et bornes, `null` s'il n'y en a aucun. */
export const encodeSharedLocationWithdrawals = (roster: SharedLocationRoster): string | null =>
  rosterOps.hasPendingWithdrawals(roster) ? JSON.stringify(roster.withdrawals) : null;

const objectOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Tolérant et fermé : une ligne illisible se saute, une précision inconnue se relit à la ville (on ouvre plus, jamais l'inverse). */
const parsedObject = (text: string | null): Record<string, unknown> => {
  if (text === null) return {};
  try {
    return objectOf(JSON.parse(text)) ?? {};
  } catch {
    return {};
  }
};

export function decodeSharedLocationRoster(text: string | null, withdrawalsText: string | null = null): SharedLocationRoster {
  const raw = parsedObject(text);
  const entries = Object.fromEntries(
    Object.entries(raw).flatMap(([id, value]) => {
      const entry = objectOf(value);
      if (!OBJECT_ID.test(id) || entry === null || !finite(entry.until)) return [];
      const precision = typeof entry.precision === 'string' && PRECISIONS.has(entry.precision) ? (entry.precision as SharedLocationPrecision) : 'city';
      return [[id, { precision, until: entry.until }] as const];
    }),
  );
  const withdrawals = Object.fromEntries(
    Object.entries(parsedObject(withdrawalsText)).flatMap(([id, until]) => (OBJECT_ID.test(id) && finite(until) ? [[id, until] as const] : [])),
  );
  return rosterOf(entries, withdrawals);
}
