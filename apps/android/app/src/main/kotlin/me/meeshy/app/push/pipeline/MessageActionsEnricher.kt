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
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.push.PushNotificationActions
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * ACTIONS : « Répondre » (saisie en ligne) et « Marquer comme lu » sur la bannière d'un message, « Commenter » (saisie en
 * ligne) sur celle d'un commentaire, d'une réponse de fil ou d'une publication d'ami, comme les catégories message/mention
 * et `MEESHY_SOCIAL_COMMENTABLE` d'iOS. Jamais sur un message protégé (éphémère, vue unique, flouté, chiffré), ni sur une
 * conversation verrouillée par code (iOS `LockedConversationNotificationCategory`) : la décision est
 * [PushNotificationActions.offer], pure et testée. L'envoi lui-même est [me.meeshy.app.push.PushNotificationActionHandler].
 * Le bouton porte le compte connecté au moment du rendu : un autre compte ne répond jamais à sa place.
 */
class MessageActionsEnricher @Inject constructor(
    @ApplicationContext private val context: Context,
    private val session: SessionRepository,
    private val proof: LaunchIntentProof,
    private val tokenStore: TokenStore,
    private val lockStore: ConversationLockStore,
) : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.ACTIONS

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        val payload = request.push.payload
        val conversationId = payload.conversationId
        val locked = conversationId != null && lockStore.isLocked(conversationId)
        val offer = PushNotificationActions.offer(payload, conversationLocked = locked)
        if (offer.comment) {
            builder.addAction(
                inlineInputAction(
                    label = R.string.push_action_comment,
                    hint = R.string.push_action_comment_hint,
                    pending = broadcast(PushActionReceiver.ACTION_COMMENT, request, mutable = true) {
                        putExtra(PushActionReceiver.EXTRA_POST_ID, payload.postId)
                        putExtra(PushActionReceiver.EXTRA_TYPE, payload.type)
                        payload.commentId?.let { putExtra(PushActionReceiver.EXTRA_COMMENT_ID, it) }
                        payload.notificationId?.let { putExtra(PushActionReceiver.EXTRA_SERVER_NOTIFICATION_ID, it) }
                    },
                ),
            )
        }
        if (conversationId == null) return
        if (offer.reply) {
            builder.addAction(
                inlineInputAction(
                    label = R.string.push_action_reply,
                    hint = R.string.push_action_reply_hint,
                    pending = broadcast(PushActionReceiver.ACTION_REPLY, request, mutable = true) {
                        putExtra(PushActionReceiver.EXTRA_CONVERSATION_ID, conversationId)
                        putExtra(PushActionReceiver.EXTRA_TYPE, payload.type)
                        payload.messageId?.let { putExtra(PushActionReceiver.EXTRA_MESSAGE_ID, it) }
                    },
                ),
            )
        }
        if (offer.markRead) {
            builder.addAction(
                NotificationCompat.Action.Builder(
                    0,
                    context.getString(R.string.push_action_mark_read),
                    broadcast(PushActionReceiver.ACTION_MARK_READ, request, mutable = false) {
                        putExtra(PushActionReceiver.EXTRA_CONVERSATION_ID, conversationId)
                        putExtra(PushActionReceiver.EXTRA_TYPE, payload.type)
                    },
                )
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                    .setShowsUserInterface(false)
                    .build(),
            )
        }
    }

    private fun inlineInputAction(label: Int, hint: Int, pending: PendingIntent): NotificationCompat.Action {
        val input = RemoteInput.Builder(PushActionReceiver.KEY_REPLY)
            .setLabel(context.getString(hint))
            .build()
        return NotificationCompat.Action.Builder(0, context.getString(label), pending)
            .addRemoteInput(input)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .setAllowGeneratedReplies(true)
            .build()
    }

    private fun broadcast(action: String, request: EnrichmentRequest, mutable: Boolean, target: Intent.() -> Unit): PendingIntent {
        val intent = Intent(context, PushActionReceiver::class.java)
            .setAction(action)
            .setData(Uri.parse("meeshy-push://${action.substringAfterLast('.').lowercase()}/${request.notificationId}"))
            .putExtra(PushActionReceiver.EXTRA_NOTIFICATION_ID, request.notificationId)
            .apply(target)
            .apply { (session.currentUserId ?: tokenStore.userId)?.let { putExtra(PushActionReceiver.EXTRA_ACCOUNT_ID, it) } }
            .let(proof::stampAction)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(context, request.notificationId, intent, flags)
    }
}
