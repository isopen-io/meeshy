package me.meeshy.app.push.pipeline

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.app.push.LaunchIntentProof
import me.meeshy.app.push.PushActionReceiver
import me.meeshy.sdk.model.push.PushNotificationActions
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * ACTIONS : « Répondre » (saisie en ligne) et « Marquer comme lu » sur la bannière d'un message,
 * comme les catégories message/mention d'iOS. Jamais sur un message protégé (éphémère, vue unique,
 * flouté, chiffré) : la décision est [PushNotificationActions.offer], pure et testée. L'envoi
 * lui-même est [me.meeshy.app.push.PushNotificationActionHandler]. Le bouton porte le compte
 * connecté au moment du rendu : un autre compte ne répond jamais à sa place.
 */
class MessageActionsEnricher @Inject constructor(
    @ApplicationContext private val context: Context,
    private val session: SessionRepository,
    private val proof: LaunchIntentProof,
) : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.ACTIONS

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        val payload = request.push.payload
        val offer = PushNotificationActions.offer(payload)
        val conversationId = payload.conversationId ?: return
        if (offer.reply) {
            val input = RemoteInput.Builder(PushActionReceiver.KEY_REPLY)
                .setLabel(context.getString(R.string.push_action_reply_hint))
                .build()
            builder.addAction(
                NotificationCompat.Action.Builder(0, context.getString(R.string.push_action_reply), broadcast(PushActionReceiver.ACTION_REPLY, conversationId, request, mutable = true))
                    .addRemoteInput(input)
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                    .setShowsUserInterface(false)
                    .setAllowGeneratedReplies(true)
                    .build(),
            )
        }
        if (offer.markRead) {
            builder.addAction(
                NotificationCompat.Action.Builder(0, context.getString(R.string.push_action_mark_read), broadcast(PushActionReceiver.ACTION_MARK_READ, conversationId, request, mutable = false))
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                    .setShowsUserInterface(false)
                    .build(),
            )
        }
    }

    private fun broadcast(action: String, conversationId: String, request: EnrichmentRequest, mutable: Boolean): PendingIntent {
        val intent = Intent(context, PushActionReceiver::class.java)
            .setAction(action)
            .setData(Uri.parse("meeshy-push://${action.substringAfterLast('.').lowercase()}/${request.notificationId}"))
            .putExtra(PushActionReceiver.EXTRA_CONVERSATION_ID, conversationId)
            .putExtra(PushActionReceiver.EXTRA_NOTIFICATION_ID, request.notificationId)
            .apply { session.currentUserId?.let { putExtra(PushActionReceiver.EXTRA_ACCOUNT_ID, it) } }
            .let(proof::stampAction)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(context, request.notificationId, intent, flags)
    }
}
