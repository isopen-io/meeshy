/**
 * **LA CARTE 5 NE PROMET QUE CE QUE L'APPAREIL PEUT TENIR** (#7729).
 *
 * « Oui, préviens-moi » n'a de sens que si une notification peut ENSUITE
 * arriver : il faut un abonnement enregistré auprès de la passerelle (jeton
 * `platform: 'web'` sur `users/register-device-token`), pas seulement une
 * permission accordée. La permission seule ne fait arriver aucun push — la
 * carte serait un contrôle qui ment (loi 4).
 *
 * L'abonné (`WebPushSubscriber`) demande la permission, obtient le jeton et
 * l'enregistre ; il est livré par #7306, lui-même suspendu au fournisseur et à
 * la clé de #7302. Tant qu'il n'existe pas, la carte n'est PAS proposée — le
 * parcours va au récapitulatif. La coque Android n'expose pas
 * `Notification` dans sa WebView : elle ne propose pas la carte non plus, son
 * chemin (plugin push natif) est #7307.
 */

export type PushSubscribeOutcome = 'subscribed' | 'denied' | 'failed';

export type WebPushSubscriber = {
  readonly subscribe: () => Promise<PushSubscribeOutcome>;
};

export type NotificationsAskOutcome = PushSubscribeOutcome | 'unavailable';

export type NotificationsOffer = {
  readonly askable: () => boolean;
  readonly ask: () => Promise<NotificationsAskOutcome>;
};

export function notificationsOffer(input: {
  readonly permission: () => NotificationPermission | null;
  readonly subscriber: WebPushSubscriber | null;
}): NotificationsOffer {
  const { subscriber } = input;
  return {
    askable: () => subscriber !== null && input.permission() === 'default',
    ask: async () => (subscriber === null ? 'unavailable' : subscriber.subscribe()),
  };
}

const browserPermission = (): NotificationPermission | null =>
  typeof globalThis.Notification === 'function' ? globalThis.Notification.permission : null;

/** L'abonné de l'application — `null` tant que #7306 ne l'a pas posé. */
export const appWebPushSubscriber: WebPushSubscriber | null = null;

export const appNotificationsOffer: NotificationsOffer = notificationsOffer({
  permission: browserPermission,
  subscriber: appWebPushSubscriber,
});
