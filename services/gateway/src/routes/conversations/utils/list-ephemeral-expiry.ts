import { hasPerReaderEphemeralDeadline, servedEphemeralExpiresAt } from '@meeshy/shared/utils/ephemeral-countdown';
import { loadEphemeralReaderDeadlines, type EphemeralDeadlinesPrisma } from '../ephemeralReaderDeadlines';
import {
  loadInheritedEphemeralDeadlines,
  type QuoteCascadePrisma,
  type QuotingRow,
} from '../../../services/messaging/quoteCascade';

/**
 * L'échéance SERVIE au lecteur pour le dernier message de chaque ligne de liste
 * (#7451 × #7545) — la même que `GET .../messages` sert dans le fil.
 *
 * `Message.expiresAt` d'un éphémère est l'heure INTERNE de destruction ; la
 * liste la servait telle quelle, si bien qu'un éphémère de trente secondes
 * s'annonçait « expire dans 7 jours » au démarrage à froid, puis passait
 * « expiré » sur un écran et « actif » sur l'autre. La ligne sert désormais
 * `D(lecteur)` (la plus tardive des `D(u)` pour l'expéditeur, `null` tant que
 * personne n'a reçu) — exactement ce que le fil ouvert affiche.
 *
 * Une lecture par conversation dont le dernier message est éphémère, en
 * parallèle ; aucune pour les autres, qui sont l'immense majorité.
 */

export interface ListLastMessage {
  readonly id: string;
  readonly senderId?: string | null;
  readonly ephemeralDuration?: number | null;
  readonly effectFlags?: number | null;
  readonly expiresAt?: Date | null;
}

export async function loadListEphemeralExpiries(
  prisma: EphemeralDeadlinesPrisma,
  rows: ReadonlyArray<{ readonly conversationId: string; readonly message: ListLastMessage | undefined }>,
  readerParticipantFor: (conversationId: string) => string | undefined,
): Promise<ReadonlyMap<string, Date | null>> {
  const ephemeral = rows.filter(
    (row): row is { conversationId: string; message: ListLastMessage } =>
      row.message !== undefined && hasPerReaderEphemeralDeadline(row.message),
  );
  const served = await Promise.all(
    ephemeral.map(async ({ conversationId, message }) => {
      const deadlines = await loadEphemeralReaderDeadlines(prisma, [message], readerParticipantFor(conversationId));
      const resolution = deadlines.get(message.id);
      return [
        message.id,
        servedEphemeralExpiresAt({
          ephemeralDuration: message.ephemeralDuration,
          effectFlags: message.effectFlags,
          rawExpiresAt: message.expiresAt ?? null,
          isSender: resolution?.isSender ?? false,
          readerDeadline: resolution?.readerDeadline ?? null,
          latestRecipientDeadline: resolution?.latestRecipientDeadline ?? null,
        }),
      ] as const;
    }),
  );
  return new Map(served);
}

/**
 * #8630 — la mort, pour CE lecteur, de ce que le dernier message de chaque ligne
 * CITE (transitivement) : une réponse meurt avec ce qu'elle cite, et sa ligne
 * de liste passe à « expiré » comme celle d'un éphémère échu. Une lecture par
 * conversation dont le dernier message est une réponse ; aucune pour les autres.
 */
export async function loadListInheritedExpiries(
  prisma: QuoteCascadePrisma,
  rows: ReadonlyArray<{ readonly conversationId: string; readonly message: (QuotingRow & ListLastMessage) | undefined }>,
  readerParticipantFor: (conversationId: string) => string | undefined,
): Promise<ReadonlyMap<string, Date>> {
  const replies = rows.filter(
    (row): row is { conversationId: string; message: QuotingRow & ListLastMessage } => Boolean(row.message?.replyToId),
  );
  const inherited = await Promise.all(
    replies.map(({ conversationId, message }) =>
      loadInheritedEphemeralDeadlines(prisma, [message], readerParticipantFor(conversationId)),
    ),
  );
  return new Map(inherited.flatMap((map) => [...map.entries()]));
}
