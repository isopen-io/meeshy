import type { QueryClient } from '@tanstack/react-query';

import {
  adjustNotificationCounts,
  findNotification,
  markNotificationsRead,
  removeNotifications,
  restoreNotifications,
  snapshotNotifications,
} from './notifications-cache';
import {
  NOTIFICATION_COUNTS_QUERY_KEY,
  postAllNotificationsRead,
  postNotificationRead,
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
