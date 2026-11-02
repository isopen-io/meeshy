package me.meeshy.app.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Les boutons de la bannière d'un message : « Répondre » (saisie en ligne) et « Marquer comme
 * lu », et celui d'une notification sociale : « Commenter » (saisie en ligne). Un récepteur, pas une activité : rien ne s'ouvre. La bannière disparaît quand l'action
 * est prise en compte ; sinon elle est reposée telle quelle, ce qui arrête l'indicateur
 * d'attente de la saisie en ligne. Non exportée : seul un `PendingIntent` de l'app l'atteint.
 */
@AndroidEntryPoint
class PushActionReceiver : BroadcastReceiver() {

    @Inject
    lateinit var handler: PushNotificationActionHandler

    @Inject
    lateinit var proof: LaunchIntentProof

    override fun onReceive(context: Context, intent: Intent) {
        val request = PushActionRequest.from(intent, proof) ?: return
        val notificationId = request.notificationId
        val accountId = request.accountId
        val reply = request.reply
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            try {
                val outcome = when (request.action) {
                    ACTION_REPLY -> handler.reply(request.conversationId ?: return@launch, reply.orEmpty(), accountId, replyToId = request.messageId)
                    ACTION_MARK_READ -> handler.markRead(request.conversationId ?: return@launch, accountId)
                    ACTION_COMMENT -> handler.comment(
                        postId = request.postId ?: return@launch,
                        text = reply.orEmpty(),
                        accountId = accountId,
                        type = request.type,
                        notifiedCommentId = request.commentId,
                        serverNotificationId = request.serverNotificationId,
                    )
                    else -> return@launch
                }
                PushActionSettlement.settle(context, notificationId, outcome)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION_REPLY = "me.meeshy.app.push.action.REPLY"
        const val ACTION_MARK_READ = "me.meeshy.app.push.action.MARK_READ"
        const val ACTION_COMMENT = "me.meeshy.app.push.action.COMMENT"
        const val EXTRA_MESSAGE_ID = "messageId"
        const val EXTRA_POST_ID = "postId"
        const val EXTRA_COMMENT_ID = "commentId"
        const val EXTRA_TYPE = "type"
        const val EXTRA_SERVER_NOTIFICATION_ID = "serverNotificationId"
        const val EXTRA_CONVERSATION_ID = "conversationId"
        const val EXTRA_NOTIFICATION_ID = "notificationId"
        const val EXTRA_ACCOUNT_ID = "accountId"
        const val KEY_REPLY = "key_text_reply"
    }
}
