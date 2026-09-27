/**
 * Codes d'erreur pour les appels vidéo
 */
export const CALL_ERROR_CODES = {
  // Authentication errors
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',

  // Connection errors
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  PEER_CONNECTION_FAILED: 'PEER_CONNECTION_FAILED',
  ICE_CONNECTION_FAILED: 'ICE_CONNECTION_FAILED',
  SIGNAL_FAILED: 'SIGNAL_FAILED',

  // Permission errors
  MEDIA_PERMISSION_DENIED: 'MEDIA_PERMISSION_DENIED',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
  /**
   * Le fil est TERMINÉ (`Conversation.isActive === false` ou `closedAt` posé) —
   * « no one can write », et un appel écrit : bulle d'appel en cours puis résumé
   * terminal, plus l'éventail de sonnerie. Refusé à l'OUVERTURE seulement ; un
   * appel déjà en cours va à son terme. Cf. `CallService.initiateCall`.
   */
  CONVERSATION_CLOSED: 'CONVERSATION_CLOSED',
  /**
   * L'interlocuteur a coupé « Appels hors contacts » (`acceptCallsFromNonContacts`)
   * et l'appelant n'est pas un ami accepté (#8073). Refusé à l'OUVERTURE d'un
   * appel direct : aucune session, aucune sonnerie, aucun appel manqué. En
   * groupe, le membre concerné n'est simplement pas sonné.
   */
  CALLEE_REFUSES_NON_CONTACTS: 'CALLEE_REFUSES_NON_CONTACTS',

  // Call state errors
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  CALL_ALREADY_ACTIVE: 'CALL_ALREADY_ACTIVE',
  CALL_ENDED: 'CALL_ENDED',
  MAX_PARTICIPANTS_REACHED: 'MAX_PARTICIPANTS_REACHED',
  FORCE_LEAVE_ERROR: 'FORCE_LEAVE_ERROR',
  INVALID_CALL_MODE: 'INVALID_CALL_MODE',
  UNSUPPORTED_CALL_TYPE: 'UNSUPPORTED_CALL_TYPE',
  ALREADY_IN_CALL: 'ALREADY_IN_CALL',
  NOT_IN_CALL: 'NOT_IN_CALL',
  /** Optimistic-locking conflict on CallSession.version persisted after retry (see CallService.joinCall). */
  CALL_STATE_CONFLICT: 'CALL_STATE_CONFLICT',

  // Media control errors
  MEDIA_TOGGLE_FAILED: 'MEDIA_TOGGLE_FAILED',

  // Feature errors
  VIDEO_CALLS_NOT_SUPPORTED: 'VIDEO_CALLS_NOT_SUPPORTED',  // PUBLIC/GLOBAL conversations
  BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',

  // Security errors (CVE fixes)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_SIGNAL: 'INVALID_SIGNAL',
  SIGNAL_SENDER_MISMATCH: 'SIGNAL_SENDER_MISMATCH',
  SIGNAL_TOO_LARGE: 'SIGNAL_TOO_LARGE',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

export type CallErrorCode = typeof CALL_ERROR_CODES[keyof typeof CALL_ERROR_CODES];
