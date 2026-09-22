import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isEphemeralServable, servedEphemeralExpiresAt } from '@meeshy/shared/utils/ephemeral-countdown';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ephemeralReaderDeadlines' });

/**
 * Plafond de la lecture d'échéances pour UNE page (#4165 : aucun `findMany` nu).
 *
 * Au-delà, les échéances manquantes sortent nulles — donc SANS décompte servi,
 * jamais le décompte d'un autre lecteur. La porte échoue en montrant moins.
 */
const EPHEMERAL_DEADLINE_SCAN_CAP = 2000;

/**
 * Les échéances d'éphémère d'UNE page de messages, résolues POUR LE LECTEUR
 * qui la demande (#7451).
 *
 * ─── POURQUOI UNE RÉSOLUTION, ET PAS UNE COLONNE ────────────────────────────
 *
 * Un éphémère n'a pas UNE échéance : il en a une par destinataire, `D(u) =
 * première réception par u + durée`. Deux lecteurs de la même conversation
 * doivent donc recevoir deux `expiresAt` différents pour le MÊME message — ce
 * qu'aucune diffusion en room ne peut faire, et ce que seule une lecture par
 * lecteur peut servir. C'est pourquoi `message:new` ne porte pas d'`expiresAt`
 * pour un éphémère, et pourquoi REST en porte un.
 *
 * L'expéditeur, lui, reçoit la plus TARDIVE des échéances connues : sur son
 * écran, le message vit tant qu'il vit pour quelqu'un. Tant que personne n'a
 * reçu, il ne reçoit RIEN — c'est l'état « en attente de réception », où les
 * clients affichent la durée sans la décompter.
 *
 * ─── LA REQUÊTE EST CONDITIONNELLE, ET C'EST LA MESURE QUI LE DIT ───────────
 *
 * `GET .../messages` est la porte la plus appelée du gateway et la très grande
 * majorité de ses pages ne porte AUCUN éphémère. La lecture n'a donc lieu que
 * si la page en contient au moins un — sinon la carte est vide, sans requête.
 */

export interface EphemeralReaderResolution {
  /** Le lecteur est-il l'AUTEUR du message ? Il ne décompte pas comme les autres. */
  readonly isSender: boolean;
  /** `D(lecteur)` — nulle tant que ce lecteur n'a rien reçu. */
  readonly readerDeadline: Date | null;
  /** `max D(u)` sur les destinataires connus — ce que l'expéditeur affiche. */
  readonly latestRecipientDeadline: Date | null;
}

export type EphemeralDeadlinesPrisma = Pick<PrismaClient, 'messageStatusEntry'>;

interface EphemeralRow {
  readonly id: string;
  readonly senderId?: string | null;
  readonly ephemeralDuration?: number | null;
}

/** Ce que la carte rend pour un message qu'aucune échéance ne concerne. */
const NO_DEADLINE: EphemeralReaderResolution = {
  isSender: false,
  readerDeadline: null,
  latestRecipientDeadline: null,
};

/**
 * @param readerParticipantId `Participant.id` du lecteur — la clé de
 *   `MessageStatusEntry`. Absent (anonyme sans participation résolue) ⇒ aucune
 *   échéance de lecteur, donc aucun décompte servi : on ferme.
 */
export async function loadEphemeralReaderDeadlines(
  prisma: EphemeralDeadlinesPrisma,
  messages: readonly EphemeralRow[],
  readerParticipantId: string | undefined,
): Promise<Map<string, EphemeralReaderResolution>> {
  const resolutions = new Map<string, EphemeralReaderResolution>();

  const ephemeralIds = messages
    .filter((message) => typeof message.ephemeralDuration === 'number' && message.ephemeralDuration > 0)
    .map((message) => message.id);
  if (ephemeralIds.length === 0) return resolutions;

  let entries: Array<{ messageId: string; participantId: string; ephemeralExpiresAt: Date | null }>;
  try {
    entries = (await prisma.messageStatusEntry.findMany({
      where: {
        messageId: { in: ephemeralIds },
        AND: [
          { ephemeralExpiresAt: { isSet: true } },
          { ephemeralExpiresAt: { not: null } },
        ],
      },
      select: { messageId: true, participantId: true, ephemeralExpiresAt: true },
      // Borné : une page sert au plus une centaine de messages, et seuls les
      // destinataires dont le décompte a DÉMARRÉ ont une ligne appariée. Le
      // plafond couvre donc largement le cas nominal tout en refusant qu'une
      // conversation à des milliers de membres fasse payer la page entière.
      take: EPHEMERAL_DEADLINE_SCAN_CAP,
    })) as Array<{ messageId: string; participantId: string; ephemeralExpiresAt: Date | null }>;
  } catch (err) {
    // Fermé par défaut : sans échéances, chaque éphémère est servi SANS
    // décompte. Les clients l'affichent alors comme « en attente de
    // réception » — un écran en retard, jamais l'échéance de quelqu'un d'autre.
    logger.warn('ephemeral reader deadlines query failed', { err });
    for (const id of ephemeralIds) resolutions.set(id, NO_DEADLINE);
    return resolutions;
  }

  const senderOf = new Map(messages.map((message) => [message.id, message.senderId ?? null]));
  const byMessage = new Map<string, { reader: Date | null; latest: Date | null }>();
  for (const id of ephemeralIds) byMessage.set(id, { reader: null, latest: null });

  for (const entry of entries) {
    const deadline = entry.ephemeralExpiresAt;
    if (!(deadline instanceof Date)) continue;
    const slot = byMessage.get(entry.messageId);
    if (!slot) continue;

    // La plus TARDIVE, sur TOUS les destinataires — y compris celui qui lit.
    if (!slot.latest || deadline.getTime() > slot.latest.getTime()) slot.latest = deadline;
    if (readerParticipantId && entry.participantId === readerParticipantId) slot.reader = deadline;
  }

  for (const [messageId, slot] of byMessage) {
    resolutions.set(messageId, {
      isSender: Boolean(readerParticipantId) && senderOf.get(messageId) === readerParticipantId,
      readerDeadline: slot.reader,
      latestRecipientDeadline: slot.latest,
    });
  }

  return resolutions;
}

/**
 * Le message est-il encore SERVABLE à ce lecteur ?
 *
 * La directive du 2026-09-22 arrête le service à `D(u) + 1 h` — une heure APRÈS
 * que la bulle a disparu de l'écran. La bulle et le service ne s'arrêtent donc
 * pas au même instant, et c'est voulu : la grâce est la fenêtre qui permet à un
 * second appareil du destinataire d'apprendre que le message a expiré plutôt que
 * de ne jamais savoir qu'il a existé.
 *
 * La coupure est une GARDE DE LECTURE, jamais une écriture : la destruction du
 * contenu appartient au balayage, et n'a lieu qu'une fois que TOUS les décomptes
 * ont passé leur grâce.
 */
export function isEphemeralServableToReader(
  message: EphemeralRow & { readonly expiresAt?: Date | null },
  resolution: EphemeralReaderResolution | undefined,
  now: Date,
): boolean {
  return isEphemeralServable({
    ephemeralDuration: message.ephemeralDuration,
    servedExpiresAt: servedEphemeralExpiresAt({
      ephemeralDuration: message.ephemeralDuration,
      rawExpiresAt: message.expiresAt ?? null,
      isSender: resolution?.isSender ?? false,
      readerDeadline: resolution?.readerDeadline ?? null,
      latestRecipientDeadline: resolution?.latestRecipientDeadline ?? null,
    }),
    now,
  });
}
