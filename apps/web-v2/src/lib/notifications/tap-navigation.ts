import { navigate } from '@/lib/router';

/**
 * LE TAP D'UNE BANNIÈRE SYSTÈME ABOUTIT, MÊME APPLICATION OUVERTE (#7305).
 *
 * `public/sw-push.js` FOCALISE un client déjà ouvert plutôt que d'en ouvrir un
 * second — c'est le bon geste : deux onglets de la même application sur un
 * tap seraient une surprise. Mais focaliser sans naviguer laisserait le
 * lecteur exactement là où il était, sur un doigt qui a demandé autre chose :
 * un contrôle qui ment est pire qu'un contrôle absent (loi 4). Le worker
 * remet donc l'adresse par `postMessage` ; ce module l'écoute.
 *
 * **L'adresse est VALIDÉE bien qu'elle vienne de notre propre worker.** Un
 * `message` arrive sur `navigator.serviceWorker` sans que le destinataire
 * choisisse son expéditeur. N'accepter qu'un chemin relatif à UNE seule barre
 * ferme la redirection ouverte par CONSTRUCTION — une garde qui dépend de la
 * confiance qu'on place dans l'émetteur n'est pas une garde.
 */

/** Le nom que `sw-push.js` pose sur son message — jumeau gardé par `check-push-target-parity.mjs`. */
export const NOTIFICATION_CLICKED_MESSAGE = 'NOTIFICATION_CLICKED';

export type TapNavigationEnvironment = {
  /** `navigator.serviceWorker` — ABSENT sur un navigateur qui n'en a pas, et dans la coque. */
  readonly container: { addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void } | undefined;
  readonly navigate: (url: string) => void;
};

/**
 * L'adresse d'un tap, ou `null` — `null` pour tout message qui n'est pas le
 * nôtre, et pour toute adresse qui sortirait de l'application.
 */
export function notificationTapUrl(message: unknown): string | null {
  if (message === null || typeof message !== 'object') return null;
  const { type, url } = message as { readonly type?: unknown; readonly url?: unknown };
  if (type !== NOTIFICATION_CLICKED_MESSAGE || typeof url !== 'string') return null;
  /* Une seule barre : `//hôte` est protocol-relative, donc une autre origine. */
  return url.startsWith('/') && !url.startsWith('//') ? url : null;
}

export function listenNotificationTaps(env: TapNavigationEnvironment): void {
  const container = env.container;
  if (container === undefined) return;
  container.addEventListener('message', (event) => {
    const url = notificationTapUrl(event.data);
    if (url !== null) env.navigate(url);
  });
}

/** L'ENVIRONNEMENT RÉEL — même découpage que `browserAppUpdateEnvironment`. */
export function listenNotificationTapsInBrowser(): void {
  listenNotificationTaps({
    container:
      'serviceWorker' in navigator
        ? (navigator.serviceWorker as unknown as TapNavigationEnvironment['container'])
        : undefined,
    navigate: (url) => navigate(url),
  });
}
