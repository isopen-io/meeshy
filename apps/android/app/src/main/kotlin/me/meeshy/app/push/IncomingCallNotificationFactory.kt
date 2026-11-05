package me.meeshy.app.push

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import me.meeshy.app.R
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_CALLER_ID
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_CALL_ID
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_CONVERSATION_ID
import me.meeshy.sdk.model.call.IncomingCallPush

/**
 * L'action « Répondre par message » de la notification d'appel entrant : une saisie directe
 * (`RemoteInput`) qui refuse l'appel puis dépose le texte dans la conversation de l'appel
 * ([DeclineCallReceiver], miroir du refus avec message d'iOS).
 *
 * Le `PendingIntent` est mutable — `RemoteInput` l'exige pour y fusionner le texte — mais il est
 * explicite (le receiver n'est pas exporté) : seul le système y glisse la saisie.
 */
internal object IncomingCallNotificationFactory {

    /** Clé du texte saisi dans le `RemoteInput`. */
    const val KEY_DECLINE_REPLY: String = "decline_reply"

    fun replyAction(context: Context, push: IncomingCallPush): NotificationCompat.Action {
        val intent = Intent(context, DeclineCallReceiver::class.java)
            .putExtra(EXTRA_CALL_ID, push.callId)
            .apply {
                push.conversationId?.let { putExtra(EXTRA_CONVERSATION_ID, it) }
                push.callerUserId?.let { putExtra(EXTRA_CALLER_ID, it) }
            }
        val pending = PendingIntent.getBroadcast(
            context,
            ("decline-reply:" + push.callId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        val input = RemoteInput.Builder(KEY_DECLINE_REPLY)
            .setLabel(context.getString(R.string.push_action_reply_hint))
            .build()
        return NotificationCompat.Action.Builder(0, context.getString(R.string.push_action_reply), pending)
            .addRemoteInput(input)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .build()
    }

    /** Le texte saisi dans la notification, ou `null` pour un simple « Refuser ». */
    fun replyText(intent: Intent): String? =
        RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_DECLINE_REPLY)?.toString()
}
