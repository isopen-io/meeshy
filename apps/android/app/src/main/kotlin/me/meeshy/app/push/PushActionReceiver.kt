package me.meeshy.app.push

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Les boutons de la bannière d'un message : « Répondre » (saisie en ligne) et « Marquer comme
 * lu ». Un récepteur, pas une activité : rien ne s'ouvre. La bannière disparaît quand l'action
 * est prise en compte ; sinon elle est reposée telle quelle, ce qui arrête l'indicateur
 * d'attente de la saisie en ligne. Non exportée : seul un `PendingIntent` de l'app l'atteint.
 */
@AndroidEntryPoint
class PushActionReceiver : BroadcastReceiver() {

    @Inject
    lateinit var handler: PushNotificationActionHandler

    override fun onReceive(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID)?.takeIf { it.isNotBlank() } ?: return
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)
        val reply = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY)?.toString()
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            try {
                val outcome = when (intent.action) {
                    ACTION_REPLY -> handler.reply(conversationId, reply.orEmpty())
                    ACTION_MARK_READ -> handler.markRead(conversationId)
                    else -> return@launch
                }
                settle(context, notificationId, outcome)
            } finally {
                pending.finish()
            }
        }
    }

    private fun settle(context: Context, notificationId: Int, outcome: PushNotificationActionHandler.Outcome) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (outcome.dismissesBanner) {
            manager.cancel(notificationId)
            return
        }
        manager.activeNotifications.firstOrNull { it.id == notificationId && it.tag == null }
            ?.let { manager.notify(notificationId, it.notification) }
    }

    companion object {
        const val ACTION_REPLY = "me.meeshy.app.push.action.REPLY"
        const val ACTION_MARK_READ = "me.meeshy.app.push.action.MARK_READ"
        const val EXTRA_CONVERSATION_ID = "conversationId"
        const val EXTRA_NOTIFICATION_ID = "notificationId"
        const val KEY_REPLY = "key_text_reply"
    }
}
