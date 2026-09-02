/**
 * Le domaine NOTIFICATION : la charge poussée, les marquages (unitaires et en
 * masse) et les compteurs.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// Prédicat des marquages de notifications en masse
import type {
  NotificationContext,
  NotificationDeletedBulkScope,
  NotificationMetadata,
  NotificationReadBulkScope,
} from '../notification.js';

/**
 * Données de notification générique
 * Aligned with NotificationFormatter.formatNotification() output.
 *
 * `title` / `subtitle` mirror the APN/FCM push payload header so the iOS
 * in-app toast (driven by Socket.IO when the app is foreground + socket
 * connected) can render the same "sender + conversation" framing as the
 * native iOS banner. They are derived from `buildPushHeader()` server-side
 * and propagated identically over the push channel and the socket channel
 * to keep both surfaces in sync.
 *  - `title`      : sender display name (or `customTitle` for system events,
 *                   `"Meeshy"` fallback when no actor)
 *  - `subtitle`   : conversation title for `new_message` notifications in
 *                   group/global/public/community conversations.
 *                   `undefined` for 1-on-1 direct messages and for non-message
 *                   notification types (reactions / mentions / system events).
 */
export interface NotificationEventData {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly priority?: string;
  /** Sender display name (or custom override / "Meeshy" fallback). */
  readonly title?: string;
  /** Conversation title for group messages — undefined for direct messages
   *  and non-message notification types. */
  readonly subtitle?: string;
  readonly content: string;
  readonly actor?: {
    readonly id?: string;
    readonly username?: string;
    readonly displayName?: string;
    readonly avatar?: string;
  };
  /**
   * Déclaré `NotificationContext` — le type RÉEL du producteur — et non plus
   * `Record<string, unknown>` (cycle 105).
   *
   * L'opacité n'était pas un choix : elle n'a jamais été confrontée à
   * l'émetteur, parce que `emitWithSeq` prenait `Record<string, unknown>` et
   * que les deux sites d'appel portaient le double cast qui le dit
   * (`socketPayload as unknown as Record<string, unknown>`). Le premier typage
   * de l'émission l'a fait tomber : `NotificationContext` est une interface,
   * donc SANS signature d'index, donc jamais assignable à une carte ouverte.
   *
   * Le type vit dans ce même paquet (`types/notification.ts`) : le déclarer ne
   * fait entrer aucune dépendance, il cesse seulement de cacher ce que les
   * trois clients reçoivent déjà.
   */
  readonly context?: NotificationContext;
  readonly metadata?: NotificationMetadata;
  readonly state: {
    readonly isRead: boolean;
    readonly readAt: Date | null;
    readonly createdAt: Date;
    readonly expiresAt?: Date;
  };
  readonly delivery?: {
    readonly emailSent: boolean;
    readonly pushSent: boolean;
  };
  /**
   * Curseur MONOTONE par utilisateur, estampillé par `emitWithSeq`
   * (`services/gateway/src/socketio/utils/emitWithSeq.ts`) — pas une propriété
   * de la notification, une propriété du TRANSPORT.
   *
   * C'est le signal de détection de TROU du SyncEngine : un client qui reçoit
   * `_seq = N+2` après `N` sait qu'un événement lui a échappé et déclenche une
   * resynchronisation. **Les trois clients l'OBSERVENT** — web
   * (`observeSyncSeq(this.syncSeq, data?._seq)`,
   * `notification-socketio.singleton.ts`), iOS (`case seq = "_seq"` →
   * `SyncSeqTracker.observe`, `MeeshySDK/Sockets/MessageSocketManager.swift`),
   * Android (`syncSeqTracker.observe(raw.opt("_seq"))`,
   * `sdk-core/.../socket/MessageSocketManager.kt`).
   *
   * Ce paragraphe a dit « les trois le lisent » pendant que **Android le
   * jetait** : son décodeur (`Json.ignoreUnknownKeys`) déposait le champ, et la
   * preuve citée — `MessageSocketManagerNotificationTest` — n'assertait rien sur
   * `_seq` ; elle prouvait exactement l'inverse, que le décodage SURVIT au champ.
   * Une citation n'est pas une mesure : le test cité prouvait la tolérance, pas
   * la lecture. Android observe depuis que ce miroir a été écrit (cycle 108).
   *
   * **Déclaré ici parce qu'il ne l'était NULLE PART** (cycle 105). Il ne
   * voyageait que parce que `emitWithSeq` prenait
   * `payload: Record<string, unknown>` : un champ porteur, traversant trois
   * décodeurs, dont aucun contrat ne parlait — exactement le cas de `location`
   * sur `ConversationUpdatedEventData` avant qu'on ne le déclare, et la même
   * conséquence : la parité entre émetteurs ne tenait qu'à la lecture du code
   * voisin.
   *
   * Optionnel, et l'absence est SIGNIFIANTE : `emitWithSeq` dégrade
   * volontairement en émettant SANS `_seq` quand l'allocation du compteur
   * rejette ou dépasse son délai. Le client traite alors l'événement sans
   * avancer son curseur, et le trou éventuel est rattrapé au prochain `/sync`.
   */
  readonly _seq?: number;
}

/**
 * Notification marquée comme lue
 */
export interface NotificationReadEventData {
  readonly notificationId: string;
}

/**
 * Lot de notifications marquées comme lues, décrit par son PRÉDICAT.
 *
 * Aucun `count` : il ferait croire à un décrément utilisable, alors qu'un cache
 * partiel matche moins de lignes que le serveur n'en a marquées. Les compteurs
 * restent tenus par `notification:counts`, émis juste après.
 */
export interface NotificationReadBulkEventData {
  readonly scope: NotificationReadBulkScope;
}

/**
 * Notification supprimée
 */
export interface NotificationDeletedEventData {
  readonly notificationId: string;
}

/**
 * Lot de notifications SUPPRIMÉES, décrit par son PRÉDICAT.
 *
 * Aucun `count`, pour la même raison que `read-bulk` — et le client ne doit de
 * toute façon toucher à aucun compteur ici : toute ligne matchée était lue,
 * donc jamais comptée dans `unread`.
 */
export interface NotificationDeletedBulkEventData {
  readonly scope: NotificationDeletedBulkScope;
}

/**
 * Compteurs de notifications
 */
export interface NotificationCountsEventData {
  readonly total: number;
  readonly unread: number;
  readonly byType?: Record<string, number>;
}
