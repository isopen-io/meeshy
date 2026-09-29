import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

/**
 * **UNE BANNIÈRE WEB SUIT SA NOTIFICATION SUPPRIMÉE** (#8752) — la coque
 * Android annule la bannière d'une notification révoquée
 * (`NotificationRevocation.java`, #8624), iOS la retire aussi sur
 * `notification:deleted` (`NotificationActionHandler.observeRevocations`).
 * Le web ne retirait que la ligne de la cloche : la bannière de `sw-push.js`
 * restait, « X a réagi ❤️ » survivant au ❤️ retiré.
 *
 * La page ferme la bannière dont `data.notificationId` est l'identifiant
 * supprimé — jamais celle d'une autre notification, même du même fil : sous le
 * `tag` d'une conversation, la bannière affichée est celle du DERNIER message.
 * Le push de révocation onglet fermé reste la décision #7309.
 */

export type ShownBanner = { readonly data?: unknown; readonly close: () => void };

export type BannerRegistry = { readonly getNotifications: () => Promise<readonly ShownBanner[]> };

const notificationIdOf = (value: unknown): string | null => {
  const id = typeof value === 'object' && value !== null ? (value as { readonly notificationId?: unknown }).notificationId : undefined;
  return typeof id === 'string' && id !== '' ? id : null;
};

async function closeBannerOf(registry: () => Promise<BannerRegistry | null>, notificationId: string): Promise<void> {
  const shown = await registry()
    .then((found) => found?.getNotifications() ?? [])
    .catch((): readonly ShownBanner[] => []);
  shown.filter((banner) => notificationIdOf(banner.data) === notificationId).forEach((banner) => banner.close());
}

/** Le service worker inscrit, s'il y en a un — la coque n'en a pas. */
export const serviceWorkerBanners = (): Promise<BannerRegistry | null> =>
  typeof navigator === 'undefined' || navigator.serviceWorker === undefined
    ? Promise.resolve(null)
    : navigator.serviceWorker.getRegistration().then((registration) => registration ?? null);

export function bridgeBannerRevocations(
  socket: SocketClient,
  registry: () => Promise<BannerRegistry | null> = serviceWorkerBanners,
): () => void {
  const onDeleted = (payload: unknown): void => {
    const notificationId = notificationIdOf(payload);
    if (notificationId !== null) void closeBannerOf(registry, notificationId);
  };
  socket.on(SERVER_EVENTS.NOTIFICATION_DELETED, onDeleted);
  return () => socket.off(SERVER_EVENTS.NOTIFICATION_DELETED, onDeleted);
}
