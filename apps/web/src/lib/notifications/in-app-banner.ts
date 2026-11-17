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
 * - une nouvelle bannière REMPLACE la précédente, sans file d'attente ;
 * - la batterie d'un Proche (`device_battery`, #14147) ne descend JAMAIS en bannière : onglet ouvert, la
 *   pastille de synchronisation la dit À LA PLACE du push — une seule voix pour un même palier ; le téléphone
 *   injoignable d'un Proche (`device_unreachable`, #18737) suit le même régime.
 */

const CALL_LAYER_TYPES = new Set(['incoming_call', 'incoming_call_alert', 'call', 'CALL_INCOMING', 'call_ended']);

/** Les types que la couche d'appel présente elle-même : ni bannière, ni lecture automatique (#18907). */
export const isCallLayerNotification = (notification: NotificationRecord): boolean => CALL_LAYER_TYPES.has(notification.type);

/** La conversation de la notification est à l'écran : son fil ouvert, ou son aperçu tiré depuis la bannière (#8821). */
export function conversationOnScreen(notification: NotificationRecord, { pathname }: { readonly pathname: string }): boolean {
  const conversationId = notification.context.conversationId;
  if (conversationId === undefined) return false;
  return conversationPreviewStore.getState().conversationId === conversationId || pathname === `/c/${encodeURIComponent(conversationId)}`;
}

export function shouldShowBanner(notification: NotificationRecord, location: { readonly pathname: string }): boolean {
  if (notification.state.isRead || isCallLayerNotification(notification)) return false;
  return !conversationOnScreen(notification, location);
}

type BannerState = {
  readonly current: NotificationRecord | null;
  readonly dismiss: () => void;
};

export const inAppBannerStore = createStore<BannerState>((set) => ({
  current: null,
  dismiss: () => set({ current: null }),
}));

/** Une notification retirée (message supprimé pour tous, réaction retirée) emporte SA bannière — jamais celle d'une autre (#18907). */
export function retractInAppBanner(id: string): void {
  if (inAppBannerStore.getState().current?.id !== id) return;
  inAppBannerStore.setState({ current: null });
}

/** La bannière appartient à l'identité qui l'a reçue : elle se vide quand celle-ci change (`identity-scoped-stores.ts`, #18907). */
export function resetInAppBanner(): void {
  inAppBannerStore.setState({ current: null });
}

/**
 * Le type que la passerelle sert pour la batterie d'un Proche (`BATTERY_NOTIFICATION_TYPE`), écrit en LITTÉRAL :
 * ce module est dans la première peinture, et le contrat de la batterie n'a rien à y faire. Un témoin tient les
 * deux égaux. La pastille n'est pas importée d'ici : l'hôte de la batterie, chargé après la première peinture,
 * confie son annonceur (`handBatteryAnnouncer`) ; avant lui, la notification se tait, elle ne descend pas en bannière.
 */
export const IN_APP_BATTERY_TYPE = 'device_battery';

type BatteryAnnouncer = (notification: NotificationRecord) => void;

let batteryAnnouncer: BatteryAnnouncer | null = null;

export function handBatteryAnnouncer(announcer: BatteryAnnouncer): () => void {
  batteryAnnouncer = announcer;
  return () => {
    if (batteryAnnouncer === announcer) batteryAnnouncer = null;
  };
}

/**
 * Le type du téléphone injoignable d'un Proche (`PHONE_REACHABILITY_NOTIFICATION_TYPE`, #18737), même régime que
 * la batterie : écrit en LITTÉRAL, tenu égal au contrat par un témoin, jamais en bannière — la pastille le dit à sa
 * place, par l'annonceur que son hôte confie (`handPhoneReachabilityAnnouncer`).
 */
export const IN_APP_PHONE_REACHABILITY_TYPE = 'device_unreachable';

let phoneReachabilityAnnouncer: BatteryAnnouncer | null = null;

export function handPhoneReachabilityAnnouncer(announcer: BatteryAnnouncer): () => void {
  phoneReachabilityAnnouncer = announcer;
  return () => {
    if (phoneReachabilityAnnouncer === announcer) phoneReachabilityAnnouncer = null;
  };
}

export function offerInAppBanner(notification: NotificationRecord, location: { readonly pathname: string }): void {
  if (notification.type === IN_APP_BATTERY_TYPE) {
    batteryAnnouncer?.(notification);
    return;
  }
  if (notification.type === IN_APP_PHONE_REACHABILITY_TYPE) {
    phoneReachabilityAnnouncer?.(notification);
    return;
  }
  if (!shouldShowBanner(notification, location)) return;
  inAppBannerStore.setState({ current: notification });
}
