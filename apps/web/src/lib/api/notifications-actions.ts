import type { QueryClient } from '@tanstack/react-query';

import {
  adjustNotificationCounts,
  findNotification,
  markNotificationsRead,
  removeNotifications,
  restoreNotifications,
  snapshotNotifications,
  unreadNotificationIds,
} from './notifications-cache';
import {
  NOTIFICATION_COUNTS_QUERY_KEY,
  NOTIFICATIONS_QUERY_KEY,
  postAllNotificationsRead,
  postNotificationRead,
  postNotificationsReadByTypes,
  removeNotification,
  type NotificationCounts,
  type NotificationsDeps,
} from './notifications';

/**
 * **LES GESTES DE LA CLOCHE, OPTIMISTES** (#6288) — CLAUDE.md § Optimistic
 * Updates : instantané → application locale → réseau → retour arrière sur
 * échec. La pastille du bouton flottant lit le MÊME compte que ces gestes
 * écrivent : elle baisse au tap, pas au retour de la passerelle.
 *
 * Le retour arrière restaure l'INSTANTANÉ plutôt que de rejouer l'inverse du
 * geste : une ligne marquée lue a QUITTÉ « Non lues », et l'y remettre à la
 * bonne place demanderait de savoir où elle était. Un événement socket arrivé
 * entre le geste et l'échec serait perdu par la restauration ; `notification:counts`
 * et la prochaine lecture le recalent — un geste REFUSÉ est rare, une ligne
 * remise au mauvais rang ne l'est pas.
 *
 * Chaque geste rend `true` s'il a abouti : l'écran annonce l'échec, jamais le
 * succès (le changement à l'écran EST l'annonce).
 */

export type NotificationActionDeps = NotificationsDeps & { readonly queryClient: QueryClient };

export async function performMarkNotificationRead(params: { readonly id: string; readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { id, deps } = params;
  const known = findNotification(deps.queryClient, id);
  if (known?.state.isRead === true) return true;

  const snapshot = snapshotNotifications(deps.queryClient);
  markNotificationsRead(deps.queryClient, (n) => n.id === id);
  if (known !== undefined) adjustNotificationCounts(deps.queryClient, { unread: -1 });

  const result = await postNotificationRead(deps, id);
  if (!result.ok) restoreNotifications(deps.queryClient, snapshot);
  return result.ok;
}

/**
 * Les lignes non lues d'UN type (#10175) : le carnet ouvert éteint « moments à immortaliser » sans toucher au reste
 * de la cloche. La passerelle, pas le cache, sait quelles lignes éteindre : le push ne part que pour un compte HORS
 * LIGNE, le tap ouvre le carnet à froid et la ligne, créée app fermée, n'est dans aucune liste en cache. D'où UNE
 * requête `read-by-types`, qui couvre aussi les lignes jamais chargées et annonce `notification:read-bulk` aux
 * autres appareils. Le cache bouge d'abord (lignes connues, compte), le compte est relu à la confirmation.
 *
 * Seule une cloche qui SAIT n'avoir aucune non-lue dispense de la requête : un compte inconnu n'est pas un zéro.
 */
export async function performMarkNotificationsOfTypeRead(params: { readonly type: string; readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { type, deps } = params;
  const matches = (n: { readonly type: string }) => n.type === type;
  const cached = unreadNotificationIds(deps.queryClient, matches);
  const counts = deps.queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY);
  if (cached.length === 0 && counts?.unread === 0) return true;

  const snapshot = snapshotNotifications(deps.queryClient);
  markNotificationsRead(deps.queryClient, matches);
  adjustNotificationCounts(deps.queryClient, { unread: -cached.length });

  const result = await postNotificationsReadByTypes(deps, [type]);
  if (!result.ok) {
    restoreNotifications(deps.queryClient, snapshot);
    return false;
  }
  void deps.queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_QUERY_KEY });
  return true;
}

/**
 * Tant que l'écran est ouvert (#10175) : une non-lue arrivée pendant qu'il est à l'écran — la fenêtre visible, le
 * service worker se tait — s'éteint aussi. Une ARRIVÉE est un compte qui MONTE ou une ligne de ce type jamais vue ;
 * le retour arrière d'un refus fait monter le compte sur des lignes déjà vues, il ne relance donc rien, pas plus que
 * la confirmation, qui le fait baisser. Rend l'arrêt, à appeler quand l'écran se ferme.
 */
export function followNotificationsOfTypeRead(params: { readonly type: string; readonly deps: NotificationActionDeps }): () => void {
  const { type, deps } = params;
  const unreadNow = () => deps.queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY)?.unread;
  const pendingOfType = () => unreadNotificationIds(deps.queryClient, (n) => n.type === type);
  const state = { stopped: false, running: false, missed: false, observed: unreadNow(), handled: new Set<string>() };

  const arrived = (): boolean => {
    const now = unreadNow();
    const rose = now !== undefined && state.observed !== undefined && now > state.observed;
    state.observed = now;
    return rose || pendingOfType().some((id) => !state.handled.has(id));
  };

  const run = async (): Promise<void> => {
    state.running = true;
    state.missed = false;
    state.handled = new Set([...state.handled, ...pendingOfType()]);
    const ok = await performMarkNotificationsOfTypeRead({ type, deps });
    state.running = false;
    state.observed = unreadNow();
    if (!state.stopped && ok && state.missed) await run();
  };
  const start = (): void =>
    void run().catch(() => {
      state.running = false;
    });

  const unsubscribe = deps.queryClient.getQueryCache().subscribe((event) => {
    if (state.stopped || event.query.queryKey[0] !== NOTIFICATIONS_QUERY_KEY[0]) return;
    if (!arrived()) return;
    if (state.running) state.missed = true;
    else start();
  });
  start();

  return () => {
    state.stopped = true;
    unsubscribe();
  };
}

export async function performMarkAllNotificationsRead(params: { readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { deps } = params;
  const snapshot = snapshotNotifications(deps.queryClient);
  markNotificationsRead(deps.queryClient, () => true);
  deps.queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, (counts) =>
    counts === undefined ? counts : { ...counts, unread: 0 },
  );

  const result = await postAllNotificationsRead(deps);
  if (!result.ok) restoreNotifications(deps.queryClient, snapshot);
  return result.ok;
}

export async function performDeleteNotification(params: { readonly id: string; readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { id, deps } = params;
  const known = findNotification(deps.queryClient, id);
  const snapshot = snapshotNotifications(deps.queryClient);
  removeNotifications(deps.queryClient, (n) => n.id === id);
  if (known !== undefined) {
    adjustNotificationCounts(deps.queryClient, { total: -1, unread: known.state.isRead ? 0 : -1 });
  }

  const result = await removeNotification(deps, id);
  if (!result.ok) restoreNotifications(deps.queryClient, snapshot);
  return result.ok;
}
