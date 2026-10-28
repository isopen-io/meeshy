package me.meeshy.app.push

import android.content.Intent
import androidx.core.app.RemoteInput

/**
 * Ce que le récepteur des boutons d'une bannière accepte d'agir (#13513). Le `PendingIntent` de « Répondre » est
 * MUTABLE (`RemoteInput` l'exige) : quiconque le détient peut y fusionner des extras. La conversation visée n'est donc
 * crue que si l'intent porte la preuve de [LaunchIntentProof.admitsAction] ; le seul champ lu hors preuve est le texte
 * saisi, qui vient du `RemoteInput`.
 */
data class PushActionRequest(
    val action: String,
    val conversationId: String,
    val notificationId: Int,
    val accountId: String?,
    val reply: String?,
) {
    companion object {
        fun from(intent: Intent, proof: LaunchIntentProof): PushActionRequest? {
            if (!proof.admitsAction(intent)) return null
            val conversationId = intent.getStringExtra(PushActionReceiver.EXTRA_CONVERSATION_ID)?.takeIf { it.isNotBlank() } ?: return null
            return PushActionRequest(
                action = intent.action ?: return null,
                conversationId = conversationId,
                notificationId = intent.getIntExtra(PushActionReceiver.EXTRA_NOTIFICATION_ID, 0),
                accountId = intent.getStringExtra(PushActionReceiver.EXTRA_ACCOUNT_ID),
                reply = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(PushActionReceiver.KEY_REPLY)?.toString(),
            )
        }
    }
}
