import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { hasPerReaderEphemeralDeadline } from '@meeshy/shared/utils/ephemeral-countdown';
import { ephemeralDeadlineForReader, type TombstoneRow } from '../../routes/conversations/ephemeralTombstone';

const PREVIEW_DEADLINE_SCAN_CAP = 2000;

type PreviewEphemeralRow = TombstoneRow & { readonly id: string; readonly senderId?: string | null };

export type PreviewReaderMessage = {
  readonly participantId: string;
  readonly message: PreviewEphemeralRow;
};

/**
 * L'échéance d'éphémère servie à chaque lecteur pour le message de SA ligne de
 * liste (#18556) — `D(u)` pour un destinataire, la règle de l'expéditeur pour
 * l'auteur (`ephemeralDeadlineForReader`). Une seule lecture pour toute
 * l'audience ; un lecteur sans échéance démarrée est absent de la carte.
 */
export async function loadPreviewReaderDeadlines(
  prisma: Pick<PrismaClient, 'messageStatusEntry'>,
  readers: ReadonlyArray<PreviewReaderMessage>,
  onError?: (error: unknown) => void,
): Promise<Map<string, Date>> {
  const ephemeral = readers.filter(({ message }) => hasPerReaderEphemeralDeadline(message));
  const messageIds = [...new Set(ephemeral.map(({ message }) => message.id))];
  if (messageIds.length === 0) return new Map();

  let entries: Array<{ messageId: string; participantId: string; ephemeralExpiresAt: Date | null }>;
  try {
    entries = (await prisma.messageStatusEntry.findMany({
      where: {
        messageId: { in: messageIds },
        AND: [{ ephemeralExpiresAt: { isSet: true } }, { ephemeralExpiresAt: { not: null } }],
      },
      select: { messageId: true, participantId: true, ephemeralExpiresAt: true },
      take: PREVIEW_DEADLINE_SCAN_CAP,
    })) as Array<{ messageId: string; participantId: string; ephemeralExpiresAt: Date | null }>;
  } catch (error) {
    onError?.(error);
    return new Map();
  }

  const started = entries.filter(
    (entry): entry is { messageId: string; participantId: string; ephemeralExpiresAt: Date } =>
      entry.ephemeralExpiresAt instanceof Date,
  );
  const latest = new Map(
    [...started]
      .sort((a, b) => a.ephemeralExpiresAt.getTime() - b.ephemeralExpiresAt.getTime())
      .map((entry) => [entry.messageId, entry.ephemeralExpiresAt] as const),
  );
  const ownDeadline = new Map(started.map((entry) => [`${entry.messageId}:${entry.participantId}`, entry.ephemeralExpiresAt]));

  return new Map(
    ephemeral.flatMap(({ participantId, message }) => {
      const isSender = message.senderId === participantId;
      const deadline = ephemeralDeadlineForReader(message, {
        isSender,
        readerDeadline: isSender ? null : ownDeadline.get(`${message.id}:${participantId}`) ?? null,
        latestRecipientDeadline: latest.get(message.id) ?? null,
      });
      return deadline ? [[participantId, deadline] as const] : [];
    }),
  );
}
