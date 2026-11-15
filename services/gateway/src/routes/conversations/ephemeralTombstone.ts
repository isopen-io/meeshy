import {
  hasPerReaderEphemeralDeadline,
  servedEphemeralExpiresAt,
} from '@meeshy/shared/utils/ephemeral-countdown';
import { withheldContentOf } from '../../services/messaging/viewOnceAudience';
import type { EphemeralReaderResolution } from './ephemeralReaderDeadlines';

export interface TombstoneRow {
  readonly ephemeralDuration?: number | null;
  readonly effectFlags?: number | null;
  readonly expiresAt?: Date | string | null;
  readonly createdAt?: Date | string | null;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ephemeralDeadlineForReader(
  row: TombstoneRow,
  resolution: EphemeralReaderResolution | undefined,
): Date | null {
  if (!hasPerReaderEphemeralDeadline(row)) return null;
  const served = servedEphemeralExpiresAt({
    ephemeralDuration: row.ephemeralDuration,
    effectFlags: row.effectFlags,
    rawExpiresAt: asDate(row.expiresAt),
    isSender: resolution?.isSender ?? false,
    readerDeadline: resolution?.readerDeadline ?? null,
    latestRecipientDeadline: resolution?.latestRecipientDeadline ?? null,
    sentAt: row.createdAt ?? null,
  });
  return served ?? null;
}

/**
 * La PIERRE TOMBALE d'un éphémère échu pour ce lecteur (#18556).
 *
 * La grâce qui suit `D(u)` garde la bulle servie, pour qu'un second appareil
 * apprenne qu'elle a brûlé plutôt que de ne jamais savoir qu'elle a existé.
 * Elle servait aussi son CONTENU, entier, une heure durant. La bulle reste,
 * datée de son échéance ; le texte, les traductions, les pièces, le chiffré et
 * son enveloppe, le lieu, le sticker et la citation ne partent plus.
 */
export function projectEphemeralTombstone<T extends object>(
  message: T,
  row: TombstoneRow,
  resolution: EphemeralReaderResolution | undefined,
  now: Date,
): T {
  const deadline = ephemeralDeadlineForReader(row, resolution);
  if (!deadline || deadline.getTime() > now.getTime()) return message;
  return {
    ...message,
    ...withheldContentOf(message),
    ...('replyTo' in message ? { replyTo: null } : {}),
    expiresAt: deadline,
  };
}
