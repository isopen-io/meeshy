/**
 * LES OCTETS D'UN APPEL (#20152) — une mesure bornée, une lecture, un CAS.
 *
 * `CallSession.bytesSent` / `bytesReceived` sont des int32 : une visio longue
 * les dépasse. Les cumuls exacts vivent à côté, dans `bytesSentTotal` /
 * `bytesReceivedTotal` (double, exact jusqu'à 2^53 − 1, la borne des clients) ;
 * les champs `Int` reçoivent la même valeur saturée, pour les anciens lecteurs
 * et pour qu'une écriture `Int` ne sorte jamais de l'int32. La lecture prend le
 * plus grand des deux ; le CAS porte sur les valeurs BRUTES lues.
 */
import type { Prisma } from '@meeshy/shared/prisma/client';

export const MAX_EXACT_BYTE_COUNT = Number.MAX_SAFE_INTEGER;
export const LEGACY_INT32_BYTE_CEILING = 2_147_483_647;

/** Les colonnes qu'un lecteur d'octets doit projeter — les deux générations. */
export const CALL_BYTE_COUNTER_SELECT = {
  bytesSent: true,
  bytesReceived: true,
  bytesSentTotal: true,
  bytesReceivedTotal: true
} as const;

export type StoredCallByteCounters = {
  readonly bytesSent?: number | null;
  readonly bytesReceived?: number | null;
  readonly bytesSentTotal?: number | null;
  readonly bytesReceivedTotal?: number | null;
};

export type CallByteCounters = {
  readonly bytesSent: number | null;
  readonly bytesReceived: number | null;
};

export type CallByteReport = {
  readonly bytesSent?: number | null;
  readonly bytesReceived?: number | null;
};

export type CallByteWritePlan = {
  readonly where: Prisma.CallSessionWhereInput;
  readonly data: Prisma.CallSessionUpdateManyMutationInput;
};

/** Plancher d'une mesure finie, positive, au plus 2^53 − 1 ; sinon `null` — jamais tronquée. */
export const boundByteCounter = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const floored = Math.floor(value);
  return floored <= MAX_EXACT_BYTE_COUNT ? floored : null;
};

const saturateToLegacyInt = (value: number): number => Math.min(value, LEGACY_INT32_BYTE_CEILING);

const largerOf = (total?: number | null, legacy?: number | null): number | null => {
  const exact = boundByteCounter(total);
  const saturated = boundByteCounter(legacy);
  if (exact === null) return saturated;
  return saturated === null ? exact : Math.max(exact, saturated);
};

/**
 * Les octets d'une ligne, champ par champ : le plus grand du total exact et de
 * l'int32 hérité. Une écriture de ce lot pose toujours int32 ≤ total ; un int32
 * plus grand ne peut venir que d'une passerelle antérieure qui a écrit APRÈS
 * (déploiement progressif, retour arrière) et laissé le total périmé.
 */
export const effectiveCallBytes = (row: StoredCallByteCounters): CallByteCounters => ({
  bytesSent: largerOf(row.bytesSentTotal, row.bytesSent),
  bytesReceived: largerOf(row.bytesReceivedTotal, row.bytesReceived)
});

/**
 * Sur le connecteur MongoDB, `{ champ: null }` ne rend PAS un document où le
 * champ est ABSENT — or les totaux sont absents de toute ligne antérieure au
 * lot, et un `Int?` jamais écrit l'est aussi. Une valeur lue nulle se compare
 * donc « nulle OU absente » ; une valeur posée, par égalité exacte.
 */
const unchangedSinceRead = (value?: number | null): ReadonlyArray<number | null | { readonly isSet: false }> =>
  value == null ? [null, { isSet: false }] : [value];

/**
 * Le « data spent » est une vue d'UN appareil : on garde la paire (envoyé,
 * reçu) du rapport au plus grand TOTAL, jamais le max champ par champ. Rend
 * `null` quand le rapport ne porte aucune mesure valide ou n'agrandit rien ;
 * sinon l'écriture, scopée à l'instantané lu des QUATRE champs.
 */
export const planCallByteWrite = (current: StoredCallByteCounters, report: CallByteReport): CallByteWritePlan | null => {
  const reportSent = boundByteCounter(report.bytesSent);
  const reportReceived = boundByteCounter(report.bytesReceived);
  if (reportSent === null && reportReceived === null) return null;
  const stored = effectiveCallBytes(current);
  const nextSent = reportSent ?? stored.bytesSent ?? 0;
  const nextReceived = reportReceived ?? stored.bytesReceived ?? 0;
  if (nextSent + nextReceived <= (stored.bytesSent ?? 0) + (stored.bytesReceived ?? 0)) return null;
  return {
    where: {
      AND: [
        { OR: unchangedSinceRead(current.bytesSent).map((bytesSent) => ({ bytesSent })) },
        { OR: unchangedSinceRead(current.bytesReceived).map((bytesReceived) => ({ bytesReceived })) },
        { OR: unchangedSinceRead(current.bytesSentTotal).map((bytesSentTotal) => ({ bytesSentTotal })) },
        { OR: unchangedSinceRead(current.bytesReceivedTotal).map((bytesReceivedTotal) => ({ bytesReceivedTotal })) }
      ]
    },
    data: {
      bytesSentTotal: nextSent,
      bytesReceivedTotal: nextReceived,
      bytesSent: saturateToLegacyInt(nextSent),
      bytesReceived: saturateToLegacyInt(nextReceived)
    }
  };
};
