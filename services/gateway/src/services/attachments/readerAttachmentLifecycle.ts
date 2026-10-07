/**
 * Ce LECTEUR lit-il encore les octets de ce message ? (#9589)
 *
 * `carrierMessageStillServesBytes` juge la vie GLOBALE du message porteur.
 * Trois échéances sont pourtant PAR LECTEUR, et la destruction globale ne les
 * suit que lorsque tout le monde les a passées — sept jours quand un membre ne
 * reçoit jamais :
 *
 *  - le décompte d'une flamme à durée, `D(u)` ;
 *  - la consommation d'une flamme après lecture, écrite dans la même colonne
 *    (`MessageStatusEntry.ephemeralExpiresAt`) ;
 *  - la vue unique ouverte, `viewedOnceAt`, plus le sursis de l'ouverture.
 *
 * Passé l'une d'elles, la bulle a disparu chez ce lecteur ; le fichier ne lui
 * est plus rendu non plus. La coupure tombe à l'échéance même, sans l'heure de
 * grâce du service des messages : celle-ci laisse un second appareil apprendre
 * qu'un message a expiré, ce qui ne demande aucun octet.
 *
 * L'EXPÉDITEUR n'a pas de ligne de statut. Seule la copie transférée (durée ET
 * après lecture, #9588) lui pose une échéance — « envoi + durée » ; ailleurs
 * il suit la vie globale du message, comme sa bulle.
 *
 * Ne vaut que là où le lecteur est CONNU : les routes par identifiant. La
 * route par chemin n'a pas d'identité et reste à la loi globale
 * (`fileRouteVerdict.ts`).
 *
 * Une lecture de statut en panne REMONTE : « encore lisible » n'est jamais le
 * verdict par défaut d'une garde.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  boundedCopySenderDeadline,
  hasPerReaderEphemeralDeadline,
  isDurationBoundedCopy,
} from '@meeshy/shared/utils/ephemeral-countdown';
import { VIEW_ONCE_BURN_GRACE_MS } from '../messaging/scheduleViewOnceBurn';

/** Les colonnes du message porteur que cette loi lit, à joindre au `select` de l'appelant. */
export const READER_LIFECYCLE_MESSAGE_SELECT = {
  senderId: true,
  createdAt: true,
  expiresAt: true,
  isViewOnce: true,
  effectFlags: true,
  ephemeralDuration: true,
} as const satisfies Prisma.MessageSelect;

export type ReaderLifecycleMessage = {
  readonly senderId?: string | null;
  readonly createdAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly isViewOnce?: boolean | null;
  readonly effectFlags?: number | null;
  readonly ephemeralDuration?: number | null;
};

const lapsed = (deadline: Date | null | undefined, now: Date): boolean =>
  deadline instanceof Date && deadline.getTime() <= now.getTime();

export async function readerStillReadsBytes(
  prisma: Pick<PrismaClient, 'messageStatusEntry'>,
  input: {
    readonly messageId: string;
    readonly message: ReaderLifecycleMessage;
    readonly attachmentIsViewOnce?: boolean | null;
    readonly readerParticipantId: string;
    readonly now: Date;
  }
): Promise<boolean> {
  const { message, now } = input;

  if (message.senderId === input.readerParticipantId) {
    return !(
      isDurationBoundedCopy(message) &&
      lapsed(
        boundedCopySenderDeadline({
          ephemeralDuration: message.ephemeralDuration,
          sentAt: message.createdAt,
          rawExpiresAt: message.expiresAt,
        }),
        now,
      )
    );
  }

  const viewOnce =
    message.isViewOnce === true ||
    input.attachmentIsViewOnce === true ||
    ((message.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) !== 0;
  if (!viewOnce && !hasPerReaderEphemeralDeadline(message)) return true;

  const entry = await prisma.messageStatusEntry.findFirst({
    where: { messageId: input.messageId, participantId: input.readerParticipantId },
    select: { ephemeralExpiresAt: true, viewedOnceAt: true },
  });
  if (!entry) return true;
  if (lapsed(entry.ephemeralExpiresAt, now)) return false;

  const opened = entry.viewedOnceAt;
  return !(opened instanceof Date && opened.getTime() + VIEW_ONCE_BURN_GRACE_MS <= now.getTime());
}
