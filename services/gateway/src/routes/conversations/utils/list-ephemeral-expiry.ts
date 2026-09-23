import { servedEphemeralExpiresAt } from '@meeshy/shared/utils/ephemeral-countdown';
import { loadEphemeralReaderDeadlines, type EphemeralDeadlinesPrisma } from '../ephemeralReaderDeadlines';

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
  readonly expiresAt?: Date | null;
}

export async function loadListEphemeralExpiries(
  prisma: EphemeralDeadlinesPrisma,
  rows: ReadonlyArray<{ readonly conversationId: string; readonly message: ListLastMessage | undefined }>,
  readerParticipantFor: (conversationId: string) => string | undefined,
): Promise<ReadonlyMap<string, Date | null>> {
  const ephemeral = rows.filter(
    (row): row is { conversationId: string; message: ListLastMessage } =>
      typeof row.message?.ephemeralDuration === 'number' && row.message.ephemeralDuration > 0,
  );
  const served = await Promise.all(
    ephemeral.map(async ({ conversationId, message }) => {
      const deadlines = await loadEphemeralReaderDeadlines(prisma, [message], readerParticipantFor(conversationId));
      const resolution = deadlines.get(message.id);
      return [
        message.id,
        servedEphemeralExpiresAt({
          ephemeralDuration: message.ephemeralDuration,
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
