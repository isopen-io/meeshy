import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { hasPerReaderEphemeralDeadline } from '@meeshy/shared/utils/ephemeral-countdown';
import { ephemeralDeadlineForReader, type TombstoneRow } from '../../routes/conversations/ephemeralTombstone';

export const PREVIEW_DEADLINE_SCAN_CAP = 2000;

type DeadlineEntry = { messageId: string; participantId: string; ephemeralExpiresAt: Date | null };

const STARTED = [{ ephemeralExpiresAt: { isSet: true } }, { ephemeralExpiresAt: { not: null } }];
const DEADLINE_SELECT = { messageId: true, participantId: true, ephemeralExpiresAt: true } as const;

type PreviewEphemeralRow = TombstoneRow & { readonly id: string; readonly senderId?: string | null };

export type PreviewReaderMessage = {
  readonly participantId: string;
  readonly message: PreviewEphemeralRow;
};

/**
 * L'échéance d'éphémère servie à chaque lecteur pour le message de SA ligne de
 * liste (#18556) — `D(u)` pour un destinataire, la règle de l'expéditeur pour
 * l'auteur (`ephemeralDeadlineForReader`), dont le feu annoncé d'une
 * flamme-œil, gravé sur sa propre ligne. Une seule lecture pour toute
 * l'audience ; un lecteur sans échéance démarrée est absent de la carte.
 *
 * Une tranche PLEINE a pu écarter des lignes : celles des lecteurs servis sont
 * alors relues par leurs couples, parce qu'une ligne absente se lirait « rien
 * n'est échu » et servirait le texte de l'aperçu. Seul `max D(u)` — le décompte
 * AFFICHÉ à l'auteur d'un éphémère à durée — reste borné par la tranche.
 */
export async function loadPreviewReaderDeadlines(
  prisma: Pick<PrismaClient, 'messageStatusEntry'>,
  readers: ReadonlyArray<PreviewReaderMessage>,
  onError?: (error: unknown) => void,
): Promise<Map<string, Date>> {
  const ephemeral = readers.filter(({ message }) => hasPerReaderEphemeralDeadline(message));
  const messageIds = [...new Set(ephemeral.map(({ message }) => message.id))];
  if (messageIds.length === 0) return new Map();

  let entries: DeadlineEntry[];
  try {
    entries = (await prisma.messageStatusEntry.findMany({
      where: { messageId: { in: messageIds }, AND: STARTED },
      select: DEADLINE_SELECT,
      take: PREVIEW_DEADLINE_SCAN_CAP,
    })) as DeadlineEntry[];
    if (entries.length >= PREVIEW_DEADLINE_SCAN_CAP) {
      const readerIds = [...new Set(ephemeral.map(({ participantId }) => participantId))];
      const own = (await prisma.messageStatusEntry.findMany({
        where: { messageId: { in: messageIds }, participantId: { in: readerIds }, AND: STARTED },
        select: DEADLINE_SELECT,
      })) as DeadlineEntry[];
      const served = new Set(readerIds);
      entries = [...entries.filter((entry) => !served.has(entry.participantId)), ...own];
    }
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
        readerDeadline: ownDeadline.get(`${message.id}:${participantId}`) ?? null,
        latestRecipientDeadline: latest.get(message.id) ?? null,
      });
      return deadline ? [[participantId, deadline] as const] : [];
    }),
  );
}
