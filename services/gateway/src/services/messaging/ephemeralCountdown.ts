import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ephemeralDestructionAt,
  recipientEphemeralDeadline,
} from '@meeshy/shared/utils/ephemeral-countdown';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import { announceEphemeralCountdownStarted } from '../../socketio/ephemeralCountdownAnnouncer';

const logger = enhancedLogger.child({ module: 'ephemeralCountdown' });

/**
 * DÉMARRER le décompte d'un éphémère — le geste, à l'instant de la première
 * réception d'un destinataire (#7451, directive porteur 2026-09-22).
 *
 * ─── CE QUE CE MODULE ÉCRIT, ET POURQUOI TROIS ÉCRITURES ────────────────────
 *
 * 1. `MessageStatusEntry.ephemeralExpiresAt` = `D(u)`, write-once. C'est
 *    l'échéance du destinataire, et la clé du balayage qui l'annoncera.
 * 2. `Message.expiresAt` = l'heure de DESTRUCTION, recalculée à chaque
 *    démarrage — le plus tardif des décomptes connus, plus une heure. Valeur
 *    INTERNE : plus aucun lecteur ne la reçoit telle quelle pour un éphémère
 *    (`servedEphemeralExpiresAt`).
 * 3. Rien d'autre. L'annonce `message:countdown-started` part du relais
 *    socket, et le `message:expired` de `D(u)` appartient au balayage.
 *
 * ─── L'ÉCRITURE EST WRITE-ONCE, DONC L'OPÉRATION EST IDEMPOTENTE ────────────
 *
 * `updateMany` guardé par l'absence de la colonne : un second accusé de
 * réception pour le même message n'écrit rien, donc n'annonce rien. C'est ce
 * qui rend sûr d'appeler ce module depuis le gel, qui tourne à chaque
 * ouverture de conversation. Le `count` de l'écriture est la SEULE mesure de
 * « c'est bien cet appel qui a démarré le décompte » — le lire avant, dans une
 * requête séparée, rouvrirait la course entre deux appareils du même
 * destinataire.
 *
 * ─── LA DESTRUCTION NE REPOUSSE JAMAIS UNE GRÂCE DE VUE UNIQUE ──────────────
 *
 * Un message peut être éphémère ET à vue unique. `scheduleViewOnceBurn` pose
 * une grâce de cinq minutes quand le budget de vues s'épuise, et sa loi est
 * écrite : « l'échéance ne se repousse jamais », la promesse la plus forte
 * gagne. Or le recalcul ci-dessus va, lui, dans les DEUX sens — un destinataire
 * qui reçoit tard repousse légitimement la destruction, sans quoi son propre
 * décompte serait tué avant son terme.
 *
 * Les deux lois se concilient par leur SUJET, pas par un ordre d'exécution :
 * sur un message à vue unique, ce module ne s'autorise que de RAPPROCHER
 * l'échéance. Le destinataire tardif d'une vue unique consommée perd donc le
 * message plus tôt que son décompte — c'est la promesse la plus forte qui
 * gagne, et elle est sur la vue unique.
 */

/** La seule surface Prisma que le démarrage d'un décompte touche. */
export type EphemeralCountdownPrisma = Pick<
  PrismaClient,
  'message' | 'messageStatusEntry' | 'participant'
>;

export interface StartEphemeralCountdownsParams {
  /** `Participant.id` du destinataire qui vient de recevoir. */
  readonly participantId: string;
  readonly conversationId: string;
  /** Les messages dont la PREMIÈRE réception vient d'être gravée. */
  readonly messageIds: readonly string[];
  /** L'instant de cette réception — la même horloge que le gel. */
  readonly at: Date;
}

export interface StartedEphemeralCountdown {
  readonly messageId: string;
  readonly conversationId: string;
  /** Room personnelle du destinataire : `Participant.userId ?? Participant.id`. */
  readonly recipientRoomKey: string;
  /** Room personnelle de l'expéditeur, même règle. */
  readonly senderRoomKey: string;
  /** `D(u)` — ce que la room du destinataire doit afficher. */
  readonly recipientExpiresAt: Date;
  /** `max D` — ce que la room de l'expéditeur doit afficher. */
  readonly latestExpiresAt: Date;
}

interface EphemeralMessageRow {
  id: string;
  conversationId: string;
  createdAt: Date;
  ephemeralDuration: number | null;
  isViewOnce: boolean;
  senderId: string;
  sender: { id: string; userId: string | null } | null;
}

/**
 * Le prédicat de base BORNE, le filet en processus DÉCIDE.
 *
 * Même raison qu'`ExpiredMessagesCleanupService._isLapsed` : le bracketing par
 * type de `not: null` n'est pas un invariant du chemin d'exécution sur le
 * connecteur MongoDB. Ici le rayon de souffle d'une erreur est d'armer une
 * destruction sur un message qui n'en a jamais demandé — on revérifie donc que
 * la durée est bien un nombre positif avant d'écrire quoi que ce soit.
 */
const declaredDuration = (row: EphemeralMessageRow): number | null => {
  const { ephemeralDuration } = row;
  return typeof ephemeralDuration === 'number' &&
    Number.isFinite(ephemeralDuration) &&
    ephemeralDuration > 0
    ? ephemeralDuration
    : null;
};

export async function startEphemeralCountdowns(
  prisma: EphemeralCountdownPrisma,
  params: StartEphemeralCountdownsParams,
): Promise<readonly StartedEphemeralCountdown[]> {
  if (params.messageIds.length === 0) return [];

  let rows: EphemeralMessageRow[];
  try {
    rows = (await prisma.message.findMany({
      where: {
        id: { in: [...params.messageIds] },
        AND: [
          { ephemeralDuration: { isSet: true } },
          { ephemeralDuration: { not: null } },
        ],
        ...unsetOrNull('deletedAt'),
      },
      select: {
        id: true,
        conversationId: true,
        createdAt: true,
        ephemeralDuration: true,
        isViewOnce: true,
        senderId: true,
        sender: { select: { id: true, userId: true } },
      },
    })) as EphemeralMessageRow[];
  } catch (err) {
    logger.warn('ephemeral countdown lookup failed', { err });
    return [];
  }

  const ephemeral = rows.filter((row) => declaredDuration(row) !== null);
  if (ephemeral.length === 0) return [];

  const recipientRoomKey = await resolveRecipientRoomKey(prisma, params.participantId);
  if (!recipientRoomKey) return [];

  const started: StartedEphemeralCountdown[] = [];

  for (const row of ephemeral) {
    const duration = declaredDuration(row);
    if (duration === null) continue;

    const deadline = recipientEphemeralDeadline({ receivedAt: params.at, ephemeralDuration: duration });
    if (!deadline) continue;

    // Write-once : `count > 0` signifie « c'est CET appel qui a démarré le
    // décompte ». Un second appareil du même destinataire, ou une seconde
    // ouverture de la conversation, n'écrit rien et n'annonce rien.
    let claimed = false;
    try {
      const written = await prisma.messageStatusEntry.updateMany({
        where: {
          messageId: row.id,
          participantId: params.participantId,
          ...unsetOrNull('ephemeralExpiresAt'),
        },
        data: { ephemeralExpiresAt: deadline },
      });
      claimed = (written?.count ?? 0) > 0;
    } catch (err) {
      logger.warn('ephemeral deadline write failed', { messageId: row.id, err });
    }
    if (!claimed) continue;

    const latest = await recomputeDestruction(prisma, row, duration);

    started.push({
      messageId: row.id,
      conversationId: row.conversationId,
      recipientRoomKey,
      senderRoomKey: row.sender?.userId ?? row.sender?.id ?? row.senderId,
      recipientExpiresAt: deadline,
      latestExpiresAt: latest ?? deadline,
    });
  }

  if (started.length > 0) announceEphemeralCountdownStarted(started);

  return started;
}

/**
 * Room personnelle du destinataire — `userId ?? id`, la règle du dépôt
 * (§ `socketio/README.md`). Un invité de lien partagé n'a pas de ligne `User`
 * et rejoint `user:<participant.id>` : l'adresser par `userId` seul sauterait
 * une room qui existe, et son décompte ne lui parviendrait jamais.
 */
async function resolveRecipientRoomKey(
  prisma: EphemeralCountdownPrisma,
  participantId: string,
): Promise<string | null> {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { id: true, userId: true },
    });
    return participant ? participant.userId ?? participant.id : null;
  } catch (err) {
    logger.warn('ephemeral countdown participant lookup failed', { participantId, err });
    return null;
  }
}

/**
 * Recalcule l'heure de DESTRUCTION depuis TOUS les décomptes connus, et la pose
 * sur `Message.expiresAt`.
 *
 * @returns le plus tardif des décomptes connus — ce que l'expéditeur affiche —
 *   ou `null` si la relecture a échoué.
 */
async function recomputeDestruction(
  prisma: EphemeralCountdownPrisma,
  row: EphemeralMessageRow,
  duration: number,
): Promise<Date | null> {
  let deadlines: Array<Date | null>;
  try {
    const entries = await prisma.messageStatusEntry.findMany({
      where: { messageId: row.id },
      select: { ephemeralExpiresAt: true },
    });
    deadlines = entries.map((entry) => entry.ephemeralExpiresAt ?? null);
  } catch (err) {
    logger.warn('ephemeral deadlines reread failed', { messageId: row.id, err });
    return null;
  }

  const known = deadlines.filter((deadline): deadline is Date => deadline instanceof Date);
  const destruction = ephemeralDestructionAt({
    sentAt: row.createdAt,
    ephemeralDuration: duration,
    recipientDeadlines: known,
  });
  if (!destruction) return null;

  try {
    await prisma.message.updateMany({
      where: {
        id: row.id,
        OR: [
          ...unsetOrNull('expiresAt').OR,
          // RAPPROCHER : toujours permis, sur tout message.
          { expiresAt: { gt: destruction } },
          // REPOUSSER : jamais sur une vue unique, dont la grâce est la
          // promesse la plus forte (cf. le doc-comment du module).
          ...(row.isViewOnce ? [] : [{ expiresAt: { lt: destruction } }]),
        ],
      },
      data: { expiresAt: destruction },
    });
  } catch (err) {
    logger.warn('ephemeral destruction write failed', { messageId: row.id, err });
  }

  return known.length > 0
    ? new Date(Math.max(...known.map((deadline) => deadline.getTime())))
    : null;
}
