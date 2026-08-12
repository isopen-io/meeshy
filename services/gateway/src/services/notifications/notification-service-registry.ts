/**
 * Registre du NotificationService PARTAGÉ du processus.
 *
 * Le NotificationService vivant est celui du MeeshySocketIOManager : c'est la
 * seule instance câblée avec `io` (via `setSocketIO`), donc la seule capable
 * d'émettre `notification:counts` / `notification:read` en temps réel.
 * Historiquement, les services qui avaient besoin d'une cascade notifications
 * (ex. MessageReadStatusService) instanciaient un `new NotificationService(prisma)`
 * local SANS `io` : les écritures DB partaient, mais chaque émission socket
 * était silencieusement avalée (`emitCountsUpdate` early-return sur `!io`) —
 * la cloche des clients ne se rafraîchissait jamais après lecture d'une
 * conversation.
 *
 * Les consommateurs font `getSharedNotificationService() ?? new NotificationService(prisma)` :
 * le repli sans `io` reste correct pour les écritures (tests unitaires, scripts).
 */

import type { NotificationService } from './NotificationService';

let sharedNotificationService: NotificationService | undefined;

export function setSharedNotificationService(service: NotificationService | undefined): void {
  sharedNotificationService = service;
}

export function getSharedNotificationService(): NotificationService | undefined {
  return sharedNotificationService;
}
