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
 * L'instant où ce message est MORT pour ce lecteur : sa propre échéance
 * d'éphémère, ou la mort de ce qu'il cite (#8630) — la plus proche des deux.
 * `null` tant que rien n'est échu.
 */
export function lapsedAtForReader(
  row: TombstoneRow,
  resolution: EphemeralReaderResolution | undefined,
  inheritedDeadline: Date | null | undefined,
  now: Date,
): Date | null {
  const lapsed = [ephemeralDeadlineForReader(row, resolution), inheritedDeadline ?? null].filter(
    (deadline): deadline is Date => deadline instanceof Date && deadline.getTime() <= now.getTime(),
  );
  return lapsed.length === 0 ? null : new Date(Math.min(...lapsed.map((deadline) => deadline.getTime())));
}

export function isLapsedForReader(
  row: TombstoneRow,
  resolution: EphemeralReaderResolution | undefined,
  inheritedDeadline: Date | null | undefined,
  now: Date,
): boolean {
  return lapsedAtForReader(row, resolution, inheritedDeadline, now) !== null;
}

/**
 * Ce qui REDIT le contenu d'un message servi sans en être le texte : la
 * citation, la story citée, la source d'un transfert (son texte et sa pièce),
 * les mentions tirées du texte, les réactions qu'il a reçues.
 */
const SERVED_ECHOES: Readonly<Record<string, unknown>> = {
  replyTo: null,
  postReplyTo: null,
  forwardedFrom: null,
  forwardedFromConversation: null,
  validatedMentions: [],
  reactionSummary: null,
  reactionCount: 0,
  currentUserReactions: [],
};

/** Les mêmes, sur une ligne BRUTE : les colonnes dont les portes dérivent ces échos. */
const RAW_WITHHELD: Readonly<Record<string, unknown>> = {
  content: '',
  translations: null,
  attachments: [],
  encryptedContent: null,
  encryptionMetadata: null,
  metadata: null,
  replyTo: null,
  validatedMentions: [],
  reactionSummary: null,
  reactionCount: 0,
  forwardedFromId: null,
  forwardedFromConversationId: null,
  storyReplyToId: null,
};

const carriedBy = (source: Readonly<Record<string, unknown>>, message: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source).filter(([key]) => key in message));

/**
 * La PIERRE TOMBALE d'un message mort pour ce lecteur (#18556).
 *
 * La grâce qui suit `D(u)` garde la bulle servie, pour qu'un second appareil
 * apprenne qu'elle a brûlé plutôt que de ne jamais savoir qu'elle a existé.
 * Elle servait aussi son CONTENU, entier, une heure durant. La bulle reste,
 * datée de sa mort ; le texte, les traductions, les pièces, le chiffré et son
 * enveloppe, le lieu, le sticker ne partent plus — ni ce qui les redit
 * (`SERVED_ECHOES`). Une réponse à un message mort pour ce lecteur meurt avec
 * lui (`inheritedDeadline`), et sort de la même façon.
 *
 * À appliquer EN DERNIER, après tout enrichissement : ce qu'une passe
 * ultérieure rattache à la bulle repartirait sinon avec elle.
 */
export function projectEphemeralTombstone<T extends object>(
  message: T,
  row: TombstoneRow,
  resolution: EphemeralReaderResolution | undefined,
  now: Date,
  inheritedDeadline?: Date | null,
): T {
  const lapsedAt = lapsedAtForReader(row, resolution, inheritedDeadline, now);
  if (!lapsedAt) return message;
  return {
    ...message,
    ...withheldContentOf(message),
    ...carriedBy(SERVED_ECHOES, message),
    expiresAt: lapsedAt,
  };
}

/**
 * La pierre tombale appliquée à une PAGE servie : chaque bulle reprend sa ligne
 * brute par son `id`, son échéance de lecteur et celle héritée de ce qu'elle
 * cite. Une bulle sans ligne passe telle quelle.
 */
export function projectEphemeralTombstonePage<T extends { id: string }>(
  served: readonly T[],
  rows: ReadonlyArray<TombstoneRow & { id: string }>,
  readerDeadlines: ReadonlyMap<string, EphemeralReaderResolution>,
  inheritedDeadlines: ReadonlyMap<string, Date>,
  now: Date,
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return served.map((message) => {
    const row = byId.get(message.id);
    return row
      ? projectEphemeralTombstone(message, row, readerDeadlines.get(message.id), now, inheritedDeadlines.get(message.id))
      : message;
  });
}

/**
 * La même pierre tombale sur une ligne BRUTE, avant toute projection : la porte
 * qui la reçoit ne peut plus rien en dériver. Limitée aux colonnes que le
 * `select` a demandées ; `replyToId` reste, il nomme un fil sans rien dire.
 */
export function withholdRawContent<T extends object>(row: T): T {
  return { ...row, ...carriedBy(RAW_WITHHELD, row) };
}
