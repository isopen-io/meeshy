import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MessageExpiredEventData } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced';
import { unsetOrNull } from '../utils/prisma-unset';
import {
  retractMessageNotifications,
  type RetractedNotificationAnnouncer,
} from './messaging/retractMessageNotifications';
import { getSharedNotificationService } from './notifications/notification-service-registry';

const log = enhancedLogger.child({ module: 'EphemeralRecipientExpiryService' });

/**
 * Le balayage qui fait DISPARAÎTRE un éphémère de l'écran de son destinataire à
 * `D(u)` — et de lui SEUL (#7451, directive porteur 2026-09-22).
 *
 * ─── POURQUOI UN SECOND BALAYAGE, À CÔTÉ DE `ExpiredMessagesCleanupService` ──
 *
 * Les deux ne gardent pas le même invariant, et fusionner leurs passes aurait
 * demandé au premier de savoir ce que le second n'a pas le droit de faire :
 *
 * | balayage | sujet | effet | audience |
 * |---|---|---|---|
 * | celui-ci | UN destinataire d'UN message | la bulle disparaît, ses bannières partent | `user:<u>` SEUL |
 * | `ExpiredMessagesCleanupService` | LE message | le clair, les fichiers et les traductions sont DÉTRUITS | la room entière |
 *
 * Le second est irréversible et n'a lieu qu'une fois que TOUS les décomptes ont
 * passé leur grâce d'une heure. Le premier est une mise hors de vue, par
 * lecteur, et doit tomber à l'heure exacte de chacun. Les confondre aurait donné
 * à la réception du destinataire le plus rapide le pouvoir de détruire le
 * message pour tous les autres.
 *
 * ─── L'ANNONCE EST À USAGE UNIQUE, ET C'EST LA COLONNE QUI LE TIENT ─────────
 *
 * `MessageStatusEntry.ephemeralExpiredAt` est posée par un `updateMany` gardé
 * sur son absence : la passe qui l'écrit est celle qui annonce, les suivantes
 * ne voient plus la ligne. Un redémarrage entre deux passes ne rejoue donc
 * rien, et rien n'est perdu non plus — la ligne reste appariée tant que
 * personne ne l'a réclamée. Un marqueur en mémoire aurait tenu la première
 * propriété et pas la seconde.
 *
 * ─── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 *
 * Il ne touche NI au contenu, NI à `Message.deletedAt`, NI aux pièces jointes :
 * entre `D(u)` et `D(u) + 1 h`, le message reste servi à `u` — c'est la grâce de
 * la directive, celle qui permet à un second appareil de `u` d'apprendre que le
 * message a expiré plutôt que de ne jamais savoir qu'il a existé. La coupure de
 * SERVICE est une garde de lecture (`isEphemeralServable`), pas une écriture.
 */

export interface EphemeralExpiryIO {
  to(room: string): { emit(event: string, data: MessageExpiredEventData): void };
}

export interface EphemeralRecipientExpiryOptions {
  /** Échéances traitées par passe. */
  batchSize?: number;
  /** Injecté par les tests — une passe lit UNE seule fois l'horloge. */
  now?: () => Date;
  /**
   * Résolu à CHAQUE passe, jamais capturé : ce service est construit au
   * démarrage, avant que le manager Socket.IO n'existe. Une capture par
   * constructeur retiendrait `null` pour toujours.
   */
  resolveIO?: () => EphemeralExpiryIO | null | undefined;
}

/**
 * La plus courte durée offerte par les clients est de 30 s : la fenêtre du
 * balayage reste du même ordre que la durée qu'elle borne — même arbitrage, et
 * même valeur, que `EXPIRED_MESSAGES_SWEEP_INTERVAL_MS`.
 */
export const EPHEMERAL_RECIPIENT_EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;

interface DueEntry {
  id: string;
  messageId: string;
  conversationId: string;
  participantId: string;
  ephemeralExpiresAt: Date | null;
}

export class EphemeralRecipientExpiryService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly batchSize: number;
  private readonly now: () => Date;
  private readonly resolveIO: () => EphemeralExpiryIO | null | undefined;

  constructor(
    private prisma: PrismaClient,
    options: EphemeralRecipientExpiryOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 500;
    this.now = options.now ?? (() => new Date());
    this.resolveIO = options.resolveIO ?? (() => null);
  }

  start(intervalMs: number = EPHEMERAL_RECIPIENT_EXPIRY_SWEEP_INTERVAL_MS): void {
    // Une passe immédiate : les échéances échues pendant l'arrêt sont
    // précisément celles qui ont le plus dépassé leur heure.
    void this.sweep().catch((err) => log.warn('initial ephemeral expiry sweep failed', { err }));
    this.interval = setInterval(() => {
      void this.sweep().catch((err) => log.warn('scheduled ephemeral expiry sweep failed', { err }));
    }, intervalMs);
    this.interval.unref?.();
    log.info('ephemeral recipient expiry sweep started', { intervalMs, batchSize: this.batchSize });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * `announcer` — même résolution que `ExpiredMessagesCleanupService` : défaut
   * de paramètre sur le service partagé du processus, évalué à CHAQUE appel.
   */
  async sweep(
    announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService(),
  ): Promise<{ expired: number }> {
    const now = this.now();

    let due: DueEntry[];
    try {
      due = (await this.prisma.messageStatusEntry.findMany({
        where: {
          AND: [
            { ephemeralExpiresAt: { isSet: true } },
            { ephemeralExpiresAt: { not: null } },
            { ephemeralExpiresAt: { lte: now } },
          ],
          ...unsetOrNull('ephemeralExpiredAt'),
        },
        select: {
          id: true,
          messageId: true,
          conversationId: true,
          participantId: true,
          ephemeralExpiresAt: true,
        },
        orderBy: { ephemeralExpiresAt: 'asc' },
        take: this.batchSize,
      })) as DueEntry[];
    } catch (err) {
      log.warn('ephemeral expiry query failed', { err });
      return { expired: 0 };
    }

    // Le prédicat de base BORNE, le filet en processus DÉCIDE : sur le
    // connecteur MongoDB, `lte` peut suivre l'ordre BSON total et laisser passer
    // l'absent ou le nul AVANT les dates. Le rayon de souffle serait ici
    // d'effacer de l'écran un message dont le décompte n'a jamais démarré.
    const lapsed = due.filter(
      (entry) =>
        entry.ephemeralExpiresAt instanceof Date &&
        entry.ephemeralExpiresAt.getTime() <= now.getTime(),
    );
    if (lapsed.length === 0) return { expired: 0 };

    let expired = 0;
    for (const entry of lapsed) {
      if (await this._expireForRecipient(entry, now, announcer)) expired += 1;
    }

    log.info('ephemeral recipient deadlines swept', { expired });
    return { expired };
  }

  /**
   * L'ordre porte la convergence : on RÉCLAME d'abord, on annonce ensuite. Une
   * annonce suivie d'un marquage en échec rejouerait `message:expired` à chaque
   * passe ; un marquage suivi d'une annonce en échec coûte un écran en retard
   * que le prochain `GET .../messages` répare (il sert `expiresAt` par lecteur).
   */
  private async _expireForRecipient(
    entry: DueEntry,
    now: Date,
    announcer: RetractedNotificationAnnouncer | undefined,
  ): Promise<boolean> {
    let claimed = false;
    try {
      const written = await this.prisma.messageStatusEntry.updateMany({
        where: { id: entry.id, ...unsetOrNull('ephemeralExpiredAt') },
        data: { ephemeralExpiredAt: now },
      });
      claimed = (written?.count ?? 0) > 0;
    } catch (err) {
      log.warn('ephemeral expiry claim failed', { entryId: entry.id, err });
      return false;
    }
    if (!claimed) return false;

    const roomKey = await this._roomKeyOf(entry.participantId);

    if (roomKey) {
      const io = this.resolveIO();
      try {
        io?.to(ROOMS.user(roomKey.room)).emit(SERVER_EVENTS.MESSAGE_EXPIRED, {
          messageId: entry.messageId,
          conversationId: entry.conversationId,
        });
      } catch (err) {
        log.warn('ephemeral expiry announce failed', { entryId: entry.id, err });
      }
    }

    // Les bannières de CE destinataire seulement — et sans attendre la
    // destruction du contenu, qui n'a lieu qu'une heure après le DERNIER
    // décompte. Un invité de lien partagé n'a pas de ligne `User`, donc aucune
    // notification à retirer : `userId` nul, on passe.
    if (roomKey?.userId) {
      try {
        await retractMessageNotifications(this.prisma, entry.messageId, announcer, {
          userId: roomKey.userId,
        });
      } catch (err) {
        log.warn('ephemeral expiry retraction failed', { entryId: entry.id, err });
      }
    }

    return true;
  }

  /**
   * Room personnelle du destinataire — `userId ?? id` (§ `socketio/README.md`),
   * et l'identité `User` séparément : la room accepte les deux espaces d'id, le
   * retrait de notifications n'accepte que le second.
   */
  private async _roomKeyOf(
    participantId: string,
  ): Promise<{ room: string; userId: string | null } | null> {
    try {
      const participant = await this.prisma.participant.findUnique({
        where: { id: participantId },
        select: { id: true, userId: true },
      });
      if (!participant) return null;
      return { room: participant.userId ?? participant.id, userId: participant.userId ?? null };
    } catch (err) {
      log.warn('ephemeral expiry participant lookup failed', { participantId, err });
      return null;
    }
  }
}
