package me.meeshy.app.push.pipeline

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.app.push.media.CircularAvatar
import me.meeshy.app.push.media.PushMediaFetcher
import me.meeshy.sdk.model.push.PushNotificationActions
import javax.inject.Inject

/**
 * STYLE : la bannière d'un message de conversation dit QUI écrit, comme la NSE iOS
 * (`INSendMessageIntent`) — un `MessagingStyle` avec l'expéditeur, sa photo en rond, le nom de la
 * conversation pour un groupe, et l'historique des messages déjà posés dans ce fil (une
 * conversation = une bannière, [me.meeshy.app.push.MessageNotificationId]).
 *
 * Le TEXTE est celui que la passerelle a servi (Prisme résolu serveur, corps de la bannière) :
 * jamais recalculé ici. Un média image garde sa grande image (phase MEDIA, plus tard).
 */
class MessagingStyleEnricher @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fetcher: PushMediaFetcher,
) : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.STYLE

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        if (!appliesTo(request)) return
        val payload = request.push.payload
        val text = request.push.notificationBody ?: payload.body ?: return
        val senderName = PushNotificationActions.senderName(payload) ?: return
        val sender = Person.Builder()
            .setName(senderName)
            .setKey(payload.senderId ?: senderName)
            .apply { avatarOf(request)?.let(::setIcon) }
            .build()

        val style = NotificationCompat.MessagingStyle(Person.Builder().setName(context.getString(R.string.push_message_you)).build())
        previousMessages(request).forEach(style::addMessage)
        style.addMessage(text, PushNotificationActions.timestampMillis(payload, System.currentTimeMillis()), sender)
        if (!payload.isDirectConversation) {
            style.isGroupConversation = true
            style.conversationTitle = payload.conversationTitle ?: request.push.notificationTitle
        }
        builder.setStyle(style)
        payload.conversationId?.let(builder::setShortcutId)
    }

    private fun previousMessages(request: EnrichmentRequest): List<NotificationCompat.MessagingStyle.Message> {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return emptyList()
        val previous = runCatching { manager.activeNotifications }.getOrNull()
            ?.firstOrNull { it.id == request.notificationId && it.tag == null }
            ?.notification ?: return emptyList()
        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(previous) ?: return emptyList()
        return style.messages.takeLast(MAX_HISTORY - 1)
    }

    private suspend fun avatarOf(request: EnrichmentRequest): IconCompat? {
        val url = request.push.payload.senderAvatar ?: return null
        val budget = minOf(AVATAR_BUDGET_MILLIS, request.deadlineMillis - System.currentTimeMillis())
        val file = fetcher.fetch(url = url, mimeType = AVATAR_MIME, declaredSize = null, data = emptyMap(), budgetMillis = budget) ?: return null
        return try {
            CircularAvatar.decode(file)?.let(IconCompat::createWithBitmap)
        } finally {
            file.delete()
        }
    }

    companion object {
        private const val MAX_HISTORY = 8
        private const val AVATAR_BUDGET_MILLIS = 2_500L
        private const val AVATAR_MIME = "image/jpeg"

        /** Un message de conversation (texte servi + expéditeur connu) : le seul cas où le style de conversation vaut. */
        fun appliesTo(request: EnrichmentRequest): Boolean {
            val payload = request.push.payload
            return PushNotificationActions.isMessage(payload) &&
                (request.push.notificationBody ?: payload.body) != null &&
                PushNotificationActions.senderName(payload) != null
        }
    }
}
