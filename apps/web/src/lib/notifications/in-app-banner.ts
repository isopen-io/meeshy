import { createStore } from 'zustand/vanilla';

import { conversationPreviewStore } from './conversation-preview';
import type { NotificationRecord } from './record';

/**
 * **LA BANNIÈRE IN-APP — QUAND ELLE DESCEND** (#8727, jumelle de
 * `NotificationToastManager.handleNewNotification` iOS, #8723) — la
 * notification RÉSEAU (`notification:new`) qui descend du haut quand
 * l'application est ouverte.
 *
 * Ce module est LÉGER à dessein : la connexion (`api/socket.ts`) l'importe sur
 * toutes les routes. Ce que la bannière DIT (`in-app-banner-view.ts`) et sa
 * peinture vivent dans le chunk de la bannière, chargé quand elle descend.
 *
 * - elle se tait sur le fil de SA conversation (le contenu y est déjà lu —
 *   `activeConversationId` d'iOS) comme sur celle ouverte EN APERÇU (#8821,
 *   `?? notificationPreviewConversation?.id` d'iOS), pour une ligne déjà
 *   lue, et pour un appel
 *   entrant ou terminé : la couche d'appel le présente elle-même ;
 * - une nouvelle bannière REMPLACE la précédente, sans file d'attente.
 */

const CALL_LAYER_TYPES = new Set(['incoming_call', 'incoming_call_alert', 'call', 'CALL_INCOMING', 'call_ended']);

export function shouldShowBanner(notification: NotificationRecord, { pathname }: { readonly pathname: string }): boolean {
  if (notification.state.isRead || CALL_LAYER_TYPES.has(notification.type)) return false;
  const conversationId = notification.context.conversationId;
  if (conversationId === undefined) return true;
  if (conversationPreviewStore.getState().conversationId === conversationId) return false;
  return pathname !== `/c/${encodeURIComponent(conversationId)}`;
}

type BannerState = {
  readonly current: NotificationRecord | null;
  readonly dismiss: () => void;
};

export const inAppBannerStore = createStore<BannerState>((set) => ({
  current: null,
  dismiss: () => set({ current: null }),
}));

export function offerInAppBanner(notification: NotificationRecord, location: { readonly pathname: string }): void {
  if (!shouldShowBanner(notification, location)) return;
  inAppBannerStore.setState({ current: notification });
}
