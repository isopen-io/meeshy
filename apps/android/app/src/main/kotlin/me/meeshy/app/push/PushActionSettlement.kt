package me.meeshy.app.push

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import me.meeshy.app.R

/**
 * Ce que devient la bannière une fois l'action prise en compte (ou non) : elle s'en va ([PushNotificationActionHandler.Outcome.dismissesBanner]),
 * ou elle est reposée SANS NOUVELLE ALERTE (`setOnlyAlertOnce`) — ce qui arrête l'indicateur d'attente de la saisie en ligne
 * sans refaire sonner le canal. Une réponse GARDÉE EN BROUILLON (#13693) la repose en le disant : « Réponse gardée en brouillon », là où l'historique de saisie montre d'ordinaire ce qu'on a envoyé.
 * Aucun texte tapé n'est relu ici.
 */
internal object PushActionSettlement {

    fun settle(context: Context, notificationId: Int, outcome: PushNotificationActionHandler.Outcome) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (outcome.dismissesBanner) {
            manager.cancel(notificationId)
            return
        }
        val posted = manager.activeNotifications.firstOrNull { it.id == notificationId && it.tag == null }?.notification ?: return
        val settled = Notification.Builder.recoverBuilder(context, posted)
            // Reposée pour arrêter l'indicateur d'attente de la saisie : un message déjà vu ne sonne ni ne vibre de nouveau.
            .setOnlyAlertOnce(true)
            .apply {
                if (outcome == PushNotificationActionHandler.Outcome.DRAFT_KEPT) {
                    setRemoteInputHistory(arrayOf<CharSequence>(context.getString(R.string.push_reply_kept_as_draft)))
                }
            }
            .build()
        manager.notify(notificationId, settled)
    }
}
