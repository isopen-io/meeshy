/**
 * Poignée de main, session et erreurs de transport : `authenticate`,
 * `authenticated`, `auth:token-expired`, `auth:session-revoked`, `error`,
 * `heartbeat`.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Données pour l'événement d'authentification
 */
/**
 * L'identité MINIMALE que l'accusé d'authentification rend au socket qui vient
 * de s'authentifier.
 *
 * Ce n'est PAS un `SocketIOUser`, et le déclarer ainsi était un mensonge de
 * contrat (cycle 101) : les deux — et seuls — émetteurs de `AUTHENTICATED`
 * (`AuthHandler._authenticateJWTUser` et `._authenticateAnonymousUser`)
 * servent exactement ces trois champs. `language` n'existe pas sur
 * `SocketIOUser` ; ses onze champs requis (`username`, `email`, `role`,
 * `isOnline`, `lastActiveAt`…) n'ont jamais voyagé sur cet événement, et un
 * participant ANONYME n'a pas de ligne `User` d'où les tirer.
 *
 * Le destinataire de cet accusé sait déjà QUI il est — il vient de présenter
 * son jeton. Ce que l'événement lui apprend, c'est sous quelle identité la
 * passerelle l'a admis (`id`), dans quelle langue elle le servira
 * (`language`), et par quel régime (`isAnonymous`).
 */
export interface AuthenticatedEventUser {
  readonly id: string;
  readonly language: string;
  readonly isAnonymous: boolean;
}

export interface AuthenticatedEventData {
  readonly success: boolean;
  readonly user?: AuthenticatedEventUser;
  readonly error?: string;
  /** `APP_VERSION` de la passerelle — émis par les deux producteurs. */
  readonly version?: string;
}

/**
 * Données pour l'événement d'erreur
 */
export interface ErrorEventData {
  readonly message: string;
  readonly code?: string;
}

export interface AuthTokenExpiredEventData {
  readonly code: 'token_expired';
  readonly message: string;
}

export interface AuthSessionRevokedEventData {
  readonly code: 'session_revoked';
  readonly message: string;
  readonly reason: 'password_changed' | 'logout_all_devices' | 'admin_revoke';
}

/**
 * Payload emitted by the server in response to a client `heartbeat` event.
 * Clients can measure RTT = (received at) - clientTime, and detect stalled
 * gateway event loops even while the WebSocket connection appears healthy.
 */
export interface HeartbeatAckEventData {
  /** ISO-8601 timestamp of the server's response — use for clock-skew diagnostics */
  readonly serverTime: string;
  /**
   * Round-trip latency hint computed by the gateway when the client includes
   * a `clientTime` in the heartbeat payload (optional, for backwards compat
   * with older clients that emit bare `heartbeat` with no payload).
   * Undefined when the client did not supply `clientTime`.
   */
  readonly latencyHintMs?: number;
}

/**
 * Données pour l'authentification
 */
export interface AuthenticateData {
  readonly userId?: string;
  readonly sessionToken?: string;
  readonly language?: string;
}
