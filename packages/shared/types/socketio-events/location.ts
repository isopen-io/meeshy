/**
 * Le domaine LOCATION : partage de position en direct — démarrage, mises à
 * jour, arrêt (charges client ET diffusions serveur).
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// ===== LOCATION SHARING EVENTS =====

export interface LocationLiveStartData {
  readonly conversationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly durationMinutes: number;
}

export interface LocationLiveStartedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly username: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly durationMinutes: number;
  readonly expiresAt: Date;
  readonly startedAt: Date;
}

export interface LocationLiveUpdateData {
  readonly conversationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
  readonly accuracy?: number;
  readonly speed?: number;
  readonly heading?: number;
}

export interface LocationLiveUpdatedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
  readonly accuracy?: number;
  readonly speed?: number;
  readonly heading?: number;
  readonly timestamp: Date;
}

export interface LocationLiveStopData {
  readonly conversationId: string;
}

export interface LocationLiveStoppedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly stoppedAt: Date;
}
