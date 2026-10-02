/**
 * La porte d'émission du processus, pour les crédits d'engagement (#8906).
 *
 * `EngagementService` est instancié partout (`new EngagementService(prisma)`,
 * routes et services) sans `io` : comme le registre du NotificationService
 * partagé, le serveur Socket.IO vivant s'enregistre ICI une fois monté
 * (`MeeshySocketIOHandler.setupSocketIO`), sous la forme d'un ACCESSEUR lu au
 * moment d'émettre. Absent (tests, scripts, démarrage) ⇒ l'émission est sautée.
 */

import type { ServerEmitIO } from '../../socketio/serverEmit';

let engagementEmitIOProvider: (() => ServerEmitIO | null | undefined) | undefined;

export function setEngagementEmitIOProvider(provider: (() => ServerEmitIO | null | undefined) | undefined): void {
  engagementEmitIOProvider = provider;
}

export function getEngagementEmitIO(): ServerEmitIO | undefined {
  return engagementEmitIOProvider?.() ?? undefined;
}
