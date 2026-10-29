package me.meeshy.app.push

import android.content.Intent
import androidx.core.app.RemoteInput

/**
 * Ce que le récepteur des boutons d'une bannière accepte d'agir (#13513). Le `PendingIntent` de « Répondre » et de
 * « Commenter » est MUTABLE (`RemoteInput` l'exige) : quiconque le détient peut y fusionner des extras. La cible visée
 * (conversation, message cité, post, commentaire, type, notification de la cloche) n'est donc crue que si l'intent porte
 * la preuve de [LaunchIntentProof.admitsAction] ; le seul champ lu hors preuve est le texte saisi, qui vient du `RemoteInput`.
 * [conversationId] est nul pour un commentaire (cible : [postId]).
 */
data class PushActionRequest(
    val action: String,
    val conversationId: String?,
    val notificationId: Int,
    val accountId: String?,
    val reply: String?,
    val messageId: String? = null,
    val postId: String? = null,
    val commentId: String? = null,
    val type: String? = null,
    val serverNotificationId: String? = null,
) {
    companion object {
        fun from(intent: Intent, proof: LaunchIntentProof): PushActionRequest? {
            if (!proof.admitsAction(intent)) return null
            fun extra(key: String): String? = intent.getStringExtra(key)?.takeIf { it.isNotBlank() }
            val conversationId = extra(PushActionReceiver.EXTRA_CONVERSATION_ID)
            val postId = extra(PushActionReceiver.EXTRA_POST_ID)
            if (conversationId == null && postId == null) return null
            return PushActionRequest(
                action = intent.action ?: return null,
                conversationId = conversationId,
                notificationId = intent.getIntExtra(PushActionReceiver.EXTRA_NOTIFICATION_ID, 0),
                accountId = intent.getStringExtra(PushActionReceiver.EXTRA_ACCOUNT_ID),
                reply = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(PushActionReceiver.KEY_REPLY)?.toString(),
                messageId = extra(PushActionReceiver.EXTRA_MESSAGE_ID),
                postId = postId,
                commentId = extra(PushActionReceiver.EXTRA_COMMENT_ID),
                type = extra(PushActionReceiver.EXTRA_TYPE),
                serverNotificationId = extra(PushActionReceiver.EXTRA_SERVER_NOTIFICATION_ID),
            )
        }
    }
}
