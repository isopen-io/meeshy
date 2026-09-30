/**
 * Présence et frappe : `user:status`, `presence:snapshot`, `typing:start` /
 * `typing:stop`.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Données pour les événements de frappe
 */
export interface TypingActionData {
  readonly conversationId: string;
}

export interface TypingEvent {
  readonly userId: string;
  /** Identifiant (handle) de l'utilisateur. Pour un participant anonyme — qui n'a pas
   *  de handle — retombe sur le nom d'affichage. */
  readonly username: string;
  /** Nom d'affichage : `displayName` explicite saisi par l'utilisateur, sinon la
   *  concaténation « Prénom Nom ». Le gateway le transmet systématiquement ; il reste
   *  optionnel pour tolérer un client/serveur antérieur. Le front-end décide quoi
   *  afficher — `displayName` en priorité, `username` en repli. */
  readonly displayName?: string;
  readonly conversationId: string;
  readonly isTyping?: boolean; // Ajouté côté service pour distinguer start/stop
}

/**
 * « Est dans la conversation » (#8892) — l'écran de la conversation est ouvert
 * et au premier plan sur au moins un appareil de l'utilisateur.
 *
 * Signal d'ACTIVITÉ, au même titre que `typing:start` : il voyage dans la room
 * de la conversation, jamais par `user:status`, et n'expose ni `isOnline` ni
 * `lastActiveAt`. Le gateway le retire au `viewing:stop`, au
 * `conversation:leave`, au passage en arrière-plan et à la déconnexion.
 */
export interface ViewingActionData {
  readonly conversationId: string;
}

export interface ViewingEvent {
  readonly userId: string;
  readonly conversationId: string;
}

/** Réponse à `viewing:start`, adressée au seul émetteur : qui est déjà là. */
export interface ViewingSnapshotEvent {
  readonly conversationId: string;
  readonly userIds: readonly string[];
}

export interface UserStatusEvent {
  readonly userId: string;
  readonly username: string;
  readonly isOnline: boolean;
  readonly lastActiveAt?: Date | null;
}

/**
 * Snapshot de présence — userIds actuellement online parmi les contacts du destinataire.
 * Émis une fois à l'authentification socket pour seed le store côté client.
 * `lastActiveAt` peut être omis (null) selon les préférences privacy.
 */
export interface PresenceSnapshotEventData {
  readonly users: readonly {
    readonly userId: string;
    readonly username: string;
    readonly isOnline: boolean;
    readonly lastActiveAt?: Date | null;
  }[];
}
