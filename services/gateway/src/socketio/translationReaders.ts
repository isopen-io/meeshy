import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloorsFor } from '../services/historyFloor';
import { ADMITTED_FILE_READER_WHERE, withoutExpiredShareLinks } from '../services/attachments/fileReaderAdmission';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'TranslationReaders' });

/**
 * QUI peut recevoir la traduction d'un message — la room entière, ou ses seuls
 * lecteurs autorisés.
 *
 * `message:translation` partait à toute la room de conversation, et la file hors
 * ligne à tous ses absents, sans regarder le plancher d'historique de personne.
 * Un invité entré par un lien sans historique recevait donc le TEXTE traduit des
 * messages écrits avant lui — dès qu'une traduction de l'un d'eux atterrissait
 * après son arrivée : rattrapage d'une langue nouvelle (#9709), traduction à la
 * demande, ou simple traduction en vol au moment où il entre.
 *
 * Le plancher d'un participant vaut `null`, sa date d'octroi
 * (`historyVisibleFrom`) ou son arrivée (`joinedAt`) — jamais autre chose. Seul
 * un participant arrivé, ou autorisé, APRÈS le message peut donc ne pas avoir le
 * droit de le lire : ce sont les seuls dont le plancher se lit. Le cas nominal —
 * un message neuf — ne coûte qu'une requête qui ne rend rien.
 *
 * FAIL-CLOSED : un plancher illisible exclut le participant ; une date de
 * message inconnue fait lire le plancher de tous, et exclut quiconque en a un.
 * Quand l'audience se restreint, un banni ou un invité au lien échu n'en est pas.
 */
export type TranslationReaders =
  | { readonly kind: 'room' }
  | {
      readonly kind: 'readers';
      /** Les rooms PERSONNELLES des lecteurs autorisés (`userId ?? id`). */
      readonly rooms: readonly string[];
      /** Les clés de file (`userId ?? id`) qui ne doivent RIEN recevoir. */
      readonly excludedQueueKeys: ReadonlySet<string>;
    };

type ReaderRow = {
  readonly id: string;
  readonly userId: string | null;
};

const queueKeyOf = (participant: ReaderRow): string => participant.userId ?? participant.id;

export async function translationReaders(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  conversationId: string,
  messageCreatedAt: Date | null,
  now: Date = new Date(),
): Promise<TranslationReaders> {
  const late = messageCreatedAt
    ? { AND: [{ OR: [{ joinedAt: { gt: messageCreatedAt } }, { historyVisibleFrom: { gt: messageCreatedAt } }] }] }
    : {};
  const suspects = await prisma.participant.findMany({
    where: { conversationId, ...ADMITTED_FILE_READER_WHERE, ...late },
    select: { id: true, userId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
  });
  if (suspects.length === 0) return { kind: 'room' };

  const floors = await loadHistoryFloorsFor(prisma, suspects).catch((error: unknown) => {
    logger.warn('history floors unreadable — late readers excluded from the translation', { conversationId, error });
    return null;
  });

  const blocked = floors === null
    ? suspects
    : suspects.filter((_, index) => {
        const floor = floors[index] ?? null;
        return floor !== null && (messageCreatedAt === null || messageCreatedAt < floor);
      });
  if (blocked.length === 0) return { kind: 'room' };

  // Les lecteurs restants passent la porte de LECTURE de la passerelle — actif,
  // jamais banni (absent ou nul), lien d'entrée non échu — celle que jugent déjà
  // la route des fichiers et leur remise temps réel (`fileReaderAdmission`).
  const blockedIds = new Set(blocked.map((participant) => participant.id));
  const [active, admittedRows] = await Promise.all([
    prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { id: true, userId: true },
    }),
    prisma.participant.findMany({
      where: { conversationId, ...ADMITTED_FILE_READER_WHERE },
      select: { id: true, userId: true, shareLinkId: true },
    }),
  ]);
  const admitted = await withoutExpiredShareLinks(prisma, admittedRows, now);
  const allowed: readonly ReaderRow[] = admitted.filter((participant) => !blockedIds.has(participant.id));
  const allowedIds = new Set(allowed.map((participant) => participant.id));

  return {
    kind: 'readers',
    rooms: [...new Set(allowed.map((participant) => ROOMS.user(queueKeyOf(participant))))],
    excludedQueueKeys: new Set(active.filter((participant) => !allowedIds.has(participant.id)).map(queueKeyOf)),
  };
}
