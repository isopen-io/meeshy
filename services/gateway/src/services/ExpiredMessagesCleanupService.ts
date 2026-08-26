import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { AttachmentService } from './attachments/AttachmentService';
import {
  applyMessageRemovalEffects,
  type RetractedNotificationAnnouncer,
} from './messaging/messageRemovalEffects';
import { getSharedNotificationService } from './notifications/notification-service-registry';
import {
  broadcastMessageMutation,
  type MessageMutationManager,
} from '../socketio/broadcastMessageMutation';
import { unsetOrNull } from '../utils/prisma-unset';

const log = enhancedLogger.child({ module: 'ExpiredMessagesCleanupService' });

/**
 * Le balayage qui DÉTRUIT ce qu'un message autodestructible a promis de
 * détruire.
 *
 * `Message.expiresAt` était écrit par les deux transports d'envoi (WS et REST),
 * les trois clients repliaient la bulle à l'échéance — et le serveur ne faisait
 * RIEN. Aucune des ~119 lectures du modèle ne filtre `expiresAt` : elles sont
 * toutes gardées par `deletedAt` seul. Aucun service ne posait ce `deletedAt`
 * sur une échéance passée. L'autodestruction n'existait donc que dans l'UI :
 * `GET /conversations/:id/messages` rendait le texte en clair indéfiniment
 * après l'échéance, et il suffisait d'une réinstallation, d'un nouvel appareil,
 * du client web (qui n'a aucun traitement d'éphémère) ou d'un appel d'API avec
 * un jeton valide pour le relire. Ce que l'expéditeur croyait effacé était
 * intact, et l'était encore un an plus tard.
 *
 * ─── POURQUOI DÉTRUIRE LE CONTENU, ET PAS SEULEMENT LE MASQUER ──────────────
 *
 * Les quatre écrivains existants de `deletedAt` posent la date et vident les
 * traductions, mais LAISSENT le clair en base : une suppression demandée par
 * une personne veut dire « retire-le de la vue », et la ligne reste
 * récupérable. Une échéance ne dit pas la même chose — elle dit « détruis-le ».
 * Ce balayage est donc le seul chemin qui écrase `content` et
 * `encryptedContent`. Masquer sans effacer aurait fermé la fuite de LECTURE en
 * laissant intacte la fuite AU REPOS, alors que c'est celle-ci que l'échéance
 * promet de fermer.
 *
 * `metadata` est détruit avec le reste, et la dette que le cycle 92 avait
 * consignée là-dessus est close. Le raisonnement qui l'avait mis hors périmètre
 * — « ce n'est pas le contenu du message » — était faux sur le champ où il
 * comptait le plus : `MessageProcessor.saveMessage` y range le lieu partagé
 * (`metadata.location`, stockage EN CLAIR assumé) et l'instantané figé du post
 * cité (`metadata.postReplyTo` : contenu, vignette, compteurs). Une position
 * GPS survivait donc à l'échéance du message qui la portait, en clair et pour
 * toujours, pendant que le texte du même message était détruit — exactement la
 * fuite au repos que cette passe a été écrite pour fermer. Il n'existe pas de
 * modèle `MessageLocation` séparé : la localisation vit dans ce champ, et la
 * seconde moitié de la dette se referme avec la première.
 *
 * L'effacement vient APRÈS la capture : `applyMessageRemovalEffects` lit
 * `metadata` pour décompter les compteurs de conversation, et travaille sur la
 * copie prise par le `select`, jamais sur une relecture de la ligne.
 *
 * ─── LES DEUX FAÇONS DONT CETTE PASSE POURRAIT FAIRE PIRE ───────────────────
 *
 * 1. **Apparier un message non éphémère.** Le bracketing par type de `$lt`
 *    n'est PAS un invariant du chemin d'exécution : le connecteur Prisma/Mongo
 *    peut passer par un pipeline d'agrégation où `$lt` suit l'ordre BSON total,
 *    et `null`/absent passent alors AVANT les dates — mesuré en production, la
 *    page entière se remplissait de lignes sans échéance que le filet refusait
 *    à chaque passe, bloquant tout burn réel. Le prédicat exclut donc ces états
 *    EXPLICITEMENT (`isSet: true` + `not: null`), et le rayon de souffle d'une
 *    erreur restant la destruction de TOUS les messages de la base, l'invariant
 *    se revérifie DANS le processus (`_isLapsed`), pas dans un commentaire.
 * 2. **Manquer un message vivant.** `deletedAt: null` seul apparie le
 *    présent-et-nul et rien d'autre ; une ligne dont le créateur n'a pas écrit
 *    `LIVE_MESSAGE_MARK` a la colonne ABSENTE et ne serait jamais balayée —
 *    l'éphémère survivrait exactement là où personne ne le chercherait.
 *    `unsetOrNull` apparie les deux états, comme partout ailleurs dans ce dépôt.
 *
 * ─── LA FENÊTRE RÉSIDUELLE ──────────────────────────────────────────────────
 *
 * Entre l'échéance et la passe qui la voit, le message reste lisible. La plus
 * courte durée offerte par les clients est de 30 s, d'où l'intervalle par
 * défaut d'une MINUTE et non l'heure du balayage des stories : la fenêtre reste
 * du même ordre que la durée qu'elle borne. La refermer complètement
 * demanderait de filtrer `expiresAt` dans les ~119 lectures du modèle ; le
 * masquage par `deletedAt`, lui, les sert TOUTES sans en toucher une seule.
 *
 * Best-effort de bout en bout : une pièce jointe qui résiste, un message que la
 * base refuse, un effet de retrait qui échoue — rien de tout cela ne doit
 * empêcher la destruction des autres, ni faire échouer la passe suivante.
 */

/** La seule surface de suppression de pièce jointe dont la passe a besoin. */
export interface ExpiredMessageAttachmentRemover {
  deleteAttachment(attachmentId: string): Promise<void>;
}

interface ExpiredMessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  sender: { id: string; userId: string | null } | null;
  content: string | null;
  metadata: unknown;
  messageType: string | null;
  expiresAt: Date | null;
  attachments: Array<{ id: string; mimeType: string | null }>;
}

export interface ExpiredMessagesCleanupOptions {
  /** Messages détruits par passe. */
  batchSize?: number;
  /** Injecté par les tests ; en production c'est `AttachmentService`. */
  attachmentRemover?: ExpiredMessageAttachmentRemover;
  /** Injecté par les tests — une passe doit lire UNE seule fois l'horloge. */
  now?: () => Date;
  /**
   * Résolu à CHAQUE annonce, jamais capturé : ce service est construit au
   * démarrage, avant que le manager Socket.IO ne soit initialisé. Une capture
   * par constructeur retiendrait `null` pour toujours — et le balayage
   * n'annoncerait jamais rien.
   */
  resolveManager?: () => MessageMutationManager | null | undefined;
}

export const EXPIRED_MESSAGES_SWEEP_INTERVAL_MS = 60 * 1000;

export class ExpiredMessagesCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private refusalStreak = 0;
  private suppressedRefusalLogs = 0;
  private readonly batchSize: number;
  private readonly attachmentRemover: ExpiredMessageAttachmentRemover;
  private readonly now: () => Date;
  private readonly resolveManager: () => MessageMutationManager | null | undefined;

  constructor(
    private prisma: PrismaClient,
    options: ExpiredMessagesCleanupOptions = {},
  ) {
    // 500 messages/passe à la minute — 720 000 par jour, de quoi absorber le
    // passif accumulé depuis la mise en service de l'éphémère sans qu'une seule
    // passe ne tienne toute la collection en mémoire.
    this.batchSize = options.batchSize ?? 500;
    this.attachmentRemover = options.attachmentRemover ?? new AttachmentService(prisma);
    this.now = options.now ?? (() => new Date());
    this.resolveManager = options.resolveManager ?? (() => null);
  }

  start(intervalMs: number = EXPIRED_MESSAGES_SWEEP_INTERVAL_MS): void {
    // Une passe immédiate au démarrage : le passif accumulé pendant que le
    // service était arrêté est précisément celui qui a le plus dépassé son
    // échéance.
    void this.cleanup().catch((err) => log.warn('initial sweep failed', { err }));
    this.interval = setInterval(() => {
      void this.cleanup().catch((err) => log.warn('scheduled sweep failed', { err }));
    }, intervalMs);
    this.interval.unref?.();
    log.info('expired-messages sweep started', { intervalMs, batchSize: this.batchSize });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * `announcer` — même résolution que `applyMessageRemovalEffects` et
   * `ExpiredStoriesCleanupService` : défaut de paramètre sur le service partagé
   * du processus, évalué à CHAQUE appel. Ce service est construit au démarrage,
   * avant l'enregistrement du service partagé ; une capture par constructeur
   * retiendrait `undefined` pour toujours.
   */
  async cleanup(
    announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService(),
  ): Promise<{ burned: number }> {
    const now = this.now();

    let candidates: ExpiredMessageRow[];
    try {
      candidates = await this.prisma.message.findMany({
        where: {
          AND: [
            { expiresAt: { isSet: true } },
            { expiresAt: { not: null } },
            { expiresAt: { lt: now } },
          ],
          // `unsetOrNull` rend une clé `OR` — sœur du `AND`, jamais dedans :
          // les deux se composent en conjonction au premier niveau.
          ...unsetOrNull('deletedAt'),
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          sender: { select: { id: true, userId: true } },
          // Capturés AVANT l'effacement : `applyMessageRemovalEffects` en a
          // besoin pour les `m+<token>` du contenu et pour le décompte des
          // compteurs de conversation, et aucun d'eux n'est relisible ensuite.
          content: true,
          metadata: true,
          messageType: true,
          expiresAt: true,
          attachments: { select: { id: true, mimeType: true } },
        },
        orderBy: { expiresAt: 'asc' },
        take: this.batchSize,
      });
    } catch (err) {
      log.warn('expired-messages query failed', { err });
      return { burned: 0 };
    }

    const lapsed = candidates.filter((message) => this._isLapsed(message, now));

    if (lapsed.length !== candidates.length) {
      // Le prédicat de base a rendu une ligne que le filet a refusée : soit
      // le connecteur ne bracket pas par type, soit quelqu'un a élargi la
      // requête. Les deux valent un signal, pas un silence — mais un signal
      // dédoublonné : à la minute, un état persistant vaudrait une tempête.
      this._reportRefusedRows(candidates, now);
    } else {
      this.refusalStreak = 0;
      this.suppressedRefusalLogs = 0;
    }

    if (lapsed.length === 0) return { burned: 0 };

    let burned = 0;
    for (const message of lapsed) {
      if (await this._burn(message, now, announcer)) burned += 1;
    }

    if (candidates.length === this.batchSize) {
      log.info('expired-messages batch saturated, backlog remains for the next pass', {
        batchSize: this.batchSize,
      });
    }

    log.info('expired-messages swept', { burned });
    return { burned };
  }

  /**
   * ERROR à la première occurrence, puis au plus une fois toutes les 10 passes
   * tant que l'état persiste — avec le compte des occurrences tues entre deux,
   * pour que le volume réel reste lisible. Une passe saine remet tout à zéro.
   */
  private _reportRefusedRows(candidates: ExpiredMessageRow[], now: Date): void {
    this.refusalStreak += 1;
    if ((this.refusalStreak - 1) % 10 !== 0) {
      this.suppressedRefusalLogs += 1;
      return;
    }
    const refused = candidates.filter((message) => !this._isLapsed(message, now));
    log.error('expired-messages query returned non-lapsed rows — burn refused', {
      returned: candidates.length,
      lapsed: candidates.length - refused.length,
      refusedSample: refused.slice(0, 3).map((message) => this._describeRefusedRow(message)),
      suppressedOccurrences: this.suppressedRefusalLogs,
    });
    this.suppressedRefusalLogs = 0;
  }

  /**
   * `expiresAt` est typé `Date | null`, mais c'est précisément quand la base
   * rend AUTRE CHOSE que ce diagnostic doit parler — d'où le passage par
   * `unknown` avant inspection.
   */
  private _describeRefusedRow(message: ExpiredMessageRow): {
    id: string;
    expiresAtType: string;
    expiresAtValue: string;
  } {
    const expiresAt: unknown = message.expiresAt;
    const expiresAtType =
      expiresAt === null
        ? 'null'
        : expiresAt === undefined
          ? 'undefined'
          : typeof expiresAt === 'object'
            ? expiresAt.constructor?.name ?? 'object'
            : typeof expiresAt;
    return {
      id: message.id,
      expiresAtType,
      expiresAtValue: JSON.stringify(expiresAt) ?? 'undefined',
    };
  }

  /** L'échéance est une DATE, et elle est passée. Tout le reste survit. */
  private _isLapsed(message: ExpiredMessageRow, now: Date): boolean {
    const { expiresAt } = message;
    return expiresAt instanceof Date && expiresAt.getTime() < now.getTime();
  }

  private async _burn(
    message: ExpiredMessageRow,
    now: Date,
    announcer: RetractedNotificationAnnouncer | undefined,
  ): Promise<boolean> {
    // Les fichiers d'abord, et l'ordre porte la convergence : si l'effacement
    // échoue, la ligne garde son `deletedAt` nul et la passe suivante la
    // reprend — les fichiers déjà partis ne manquent à personne. Dans l'autre
    // sens, un effacement réussi suivi d'une suppression de fichier en échec
    // retirerait la ligne du prédicat, et les fichiers resteraient orphelins
    // pour toujours.
    if (message.attachments.length > 0) {
      await Promise.allSettled(
        message.attachments.map((attachment) => this.attachmentRemover.deleteAttachment(attachment.id)),
      );
    }

    try {
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          content: '',
          encryptedContent: null,
          translations: null,
          metadata: null,
          deletedAt: now,
        },
      });
    } catch (err) {
      // Une ligne qui résiste est reprise à la passe suivante : son `deletedAt`
      // n'a pas bougé, donc le prédicat l'apparie encore.
      log.warn('expired message erase failed', { messageId: message.id, err });
      return false;
    }

    try {
      await applyMessageRemovalEffects(
        this.prisma,
        {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderUserId: message.sender?.userId ?? null,
          messageType: message.messageType,
          attachmentMimeTypes: message.attachments.map((attachment) => attachment.mimeType ?? ''),
          content: message.content,
          metadata: message.metadata,
        },
        announcer,
      );
    } catch (err) {
      // `applyMessageRemovalEffects` est déjà best-effort effet par effet ; ce
      // filet ne couvre que l'imprévu. Le contenu est détruit — c'est
      // l'invariant qui compte, et il ne se défait pas.
      log.warn('expired message removal effects failed', { messageId: message.id, err });
    }

    await this._announce(message);

    return true;
  }

  /**
   * L'annonce du retrait, par l'unité que les cinq autres transports de
   * mutation partagent déjà. Ce balayage en est le SIXIÈME, et
   * `broadcastMessageMutation` existe précisément pour qu'un sixième ne
   * réimplémente pas les quatre canaux à la main : la room, la liste de
   * conversations, la pastille de non-lus et la file hors ligne.
   *
   * Sans elle, la destruction n'était visible qu'au prochain chargement. Sur
   * iOS et Android le repli local masquait l'attente ; sur le WEB, qui n'a
   * AUCUN traitement d'éphémère, le message échu restait affiché et lisible
   * tant que l'onglet vivait — le seul client pour lequel la destruction ne
   * changeait rien à l'écran était celui qui en avait le plus besoin.
   *
   * APRÈS l'effacement, jamais avant : un client qui recharge sur l'événement
   * ne doit pas retrouver la ligne qu'on vient de lui dire détruite.
   *
   * `actorUserId` prend l'auteur, et c'est exact plutôt que commode — une
   * autodestruction est l'acte que l'auteur a programmé en envoyant, et c'est
   * bien lui que `updatedBy` doit nommer. Conséquence assumée : ses propres
   * appareils hors ligne ne reçoivent pas le rejeu, l'exclusion d'acteur de la
   * file portant sur cette identité. Ce sont les seuls à ne rien perdre — ils
   * tiennent le minuteur qui a décidé de la destruction.
   *
   * `authorId` prend le `Participant.id` : l'exclusion de la pastille est large
   * (`emitUnreadCountsToRecipients` apparie les DEUX espaces d'id), et l'auteur
   * anonyme n'a pas d'autre identité.
   */
  private async _announce(message: ExpiredMessageRow): Promise<void> {
    const manager = this.resolveManager();
    if (!manager) return;

    await broadcastMessageMutation({
      prisma: this.prisma,
      manager,
      conversationId: message.conversationId,
      actorUserId: message.sender?.userId ?? message.senderId,
      eventType: 'deleted',
      authorId: message.senderId,
      messageId: message.id,
      payload: { messageId: message.id, conversationId: message.conversationId },
      onError: (err) => log.warn('expired message broadcast failed', { messageId: message.id, err }),
    });
  }
}
