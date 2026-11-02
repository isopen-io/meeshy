package me.meeshy.app.push

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import me.meeshy.app.R

/**
 * Ce que devient la bannière une fois l'action prise en compte (ou non) : elle s'en va ([PushNotificationActionHandler.Outcome.dismissesBanner]),
 * ou elle est reposée telle quelle — ce qui arrête l'indicateur d'attente de la saisie en ligne. Une réponse GARDÉE EN BROUILLON
 * (#13693) la repose en le disant : « Réponse gardée en brouillon », là où l'historique de saisie montre d'ordinaire ce qu'on a envoyé.
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
        if (outcome != PushNotificationActionHandler.Outcome.DRAFT_KEPT || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            manager.notify(notificationId, posted)
            return
        }
        val note = context.getString(R.string.push_reply_kept_as_draft)
        val noted = Notification.Builder.recoverBuilder(context, posted)
            .setRemoteInputHistory(arrayOf<CharSequence>(note))
            .setOnlyAlertOnce(true)
            .build()
        manager.notify(notificationId, noted)
    }
}
