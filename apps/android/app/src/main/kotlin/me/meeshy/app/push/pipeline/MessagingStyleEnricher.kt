package me.meeshy.app.push.pipeline

import android.app.NotificationManager
import android.content.Context
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.app.push.media.CircularAvatar
import me.meeshy.app.push.media.PushMediaFetcher
import me.meeshy.sdk.model.push.ConversationShortcutId
import me.meeshy.sdk.model.push.PushConversationLockSeal
import me.meeshy.sdk.model.push.PushNotificationActions
import me.meeshy.sdk.model.push.PushPresentationText
import javax.inject.Inject

/**
 * STYLE : la bannière d'un message de conversation dit QUI écrit, comme la NSE iOS
 * (`INSendMessageIntent`) — un `MessagingStyle` avec l'expéditeur, sa photo en rond, le nom de la
 * conversation pour un groupe, et l'historique des messages déjà posés dans ce fil (une
 * conversation = une bannière, [me.meeshy.app.push.MessageNotificationId]).
 *
 * Le TEXTE est celui que la passerelle a servi (Prisme résolu serveur, corps de la bannière) :
 * jamais recalculé ici. Un message PROTÉGÉ (éphémère, vue unique, flouté, chiffré) garde le
 * placeholder servi et ne télécharge pas la photo de l'expéditeur. Un média image garde sa grande image (phase MEDIA, plus tard).
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
        val posted = postedConversation(request, text)
        val conversation = posted?.takeIf { payload.isCorrection }?.corrected(payload.messageId, text)
            ?: arrivingConversation(request, text, posted)
            ?: run {
                builder.setStyle(NotificationCompat.BigTextStyle().bigText(text))
                return
            }
        builder.setStyle(conversation.style())
        builder.addExtras(Bundle().apply { putStringArrayList(MESSAGE_IDS_KEY, ArrayList(conversation.bubbles.map { it.messageId.orEmpty() })) })
        ConversationShortcutId.of(payload.conversationId)?.let(builder::setShortcutId)
    }

    /**
     * La conversation d'un message qui ARRIVE : l'historique déjà posé puis ce message, sous l'expéditeur servi. Une
     * CORRECTION qui n'a rien à corriger n'empile aucun historique : son texte devient le seul message. `null` sans
     * expéditeur connu — la bannière se rend alors en texte simple.
     */
    private suspend fun arrivingConversation(request: EnrichmentRequest, text: String, posted: Conversation?): Conversation? {
        val payload = request.push.payload
        val servedName = PushNotificationActions.senderName(payload) ?: return null
        val showName = request.preferences.showSenderName
        val senderName = if (showName) servedName else context.getString(R.string.push_someone)
        val sender = Person.Builder()
            .setName(senderName)
            .setKey(if (showName) payload.senderId ?: servedName else "anonymous")
            .apply { if (showName) avatarOf(request)?.let(::setIcon) }
            .build()
        val fresh = Bubble(
            payload.messageId,
            NotificationCompat.MessagingStyle.Message(text, PushNotificationActions.timestampMillis(payload, System.currentTimeMillis()), sender),
        )
        val history = if (payload.isCorrection) emptyList() else posted?.bubbles.orEmpty().takeLast(MAX_HISTORY - 1)
        val isGroup = !payload.isDirectConversation
        val title = payload.conversationTitle
            ?.let { "${PushPresentationText.groupMarker(payload.conversationType)} $it".trim() }
            ?: request.push.notificationTitle
        return Conversation(
            user = Person.Builder().setName(context.getString(R.string.push_message_you)).build(),
            title = title.takeIf { isGroup },
            isGroup = isGroup,
            bubbles = history + fresh,
        )
    }

    /**
     * La conversation déjà posée sous cet index, chaque message avec son identité. Sous le scellé d'un verrou PIN, seuls
     * les messages identiques au libellé survivent : une bannière posée AVANT le verrou porte du texte en clair qui ne
     * doit pas être recopié. L'identité voyage dans les extras de la NOTIFICATION, jamais dans ceux du message, que la
     * plateforme ne garde pas sous Android 9.
     */
    private fun postedConversation(request: EnrichmentRequest, served: String): Conversation? {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return null
        val previous = runCatching { manager.activeNotifications }.getOrNull()
            ?.firstOrNull { it.id == request.notificationId && it.tag == null }
            ?.notification ?: return null
        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(previous) ?: return null
        val ids = previous.extras.getStringArrayList(MESSAGE_IDS_KEY)?.takeIf { it.size == style.messages.size }
        val sealed = PushConversationLockSeal.isSealed(request.push.payload)
        val bubbles = style.messages
            .mapIndexed { index, message -> Bubble(ids?.get(index)?.takeIf(String::isNotEmpty), message) }
            .filter { !sealed || it.message.text.toString() == served }
        return Conversation(style.user, style.conversationTitle, style.isGroupConversation, bubbles)
    }

    /** La photo de l'expéditeur ne voyage jamais avec un message protégé : seul son nom est dit, comme le titre servi. */
    private suspend fun avatarOf(request: EnrichmentRequest): IconCompat? {
        val payload = request.push.payload
        if (!payload.mediaMayTravel) return null
        val url = payload.senderAvatar ?: return null
        val budget = minOf(AVATAR_BUDGET_MILLIS, request.deadlineMillis - System.currentTimeMillis())
        val file = fetcher.fetch(url = url, mimeType = AVATAR_MIME, declaredSize = null, data = emptyMap(), budgetMillis = budget) ?: return null
        return try {
            CircularAvatar.decode(file)?.let(IconCompat::createWithBitmap)
        } finally {
            file.delete()
        }
    }

    companion object {
        /** Les identités des messages de la bannière, dans leur ordre : la correction retrouve ainsi le texte qu'elle remplace. */
        private const val MESSAGE_IDS_KEY = "meeshy.messageIds"
        private const val MAX_HISTORY = 8
        private const val AVATAR_BUDGET_MILLIS = 2_500L
        private const val AVATAR_MIME = "image/jpeg"

        /**
         * Un message de conversation (texte servi + expéditeur connu) : le seul cas où le style de conversation vaut. Une
         * CORRECTION aussi, même sans expéditeur (la passerelle n'en sert pas) : elle réécrit la conversation déjà posée.
         */
        fun appliesTo(request: EnrichmentRequest): Boolean {
            val payload = request.push.payload
            return PushNotificationActions.isMessage(payload) &&
                (request.push.notificationBody ?: payload.body) != null &&
                (payload.isCorrection || PushNotificationActions.senderName(payload) != null)
        }
    }

    /** Un message de la bannière et son identité (`null` : posé avant que les messages la portent). */
    private data class Bubble(val messageId: String?, val message: NotificationCompat.MessagingStyle.Message)

    /** Une conversation de bannière, telle qu'on la lit dans le tiroir ou qu'on va l'y poser. */
    private data class Conversation(
        val user: Person,
        val title: CharSequence?,
        val isGroup: Boolean,
        val bubbles: List<Bubble>,
    ) {
        /**
         * Le texte d'après du message [messageId], à sa place et sous son horodatage, sans empiler l'ancien à côté. Message
         * non reconnu : la conversation reste telle quelle. `null` sans message lisible — rien à corriger.
         */
        fun corrected(messageId: String?, text: String): Conversation? {
            if (bubbles.isEmpty()) return null
            return copy(
                bubbles = bubbles.takeLast(MAX_HISTORY).map { bubble ->
                    if (messageId != null && bubble.messageId == messageId) bubble.copy(message = bubble.message.withText(text)) else bubble
                },
            )
        }

        fun style(): NotificationCompat.MessagingStyle = NotificationCompat.MessagingStyle(user).also { style ->
            bubbles.forEach { style.addMessage(it.message) }
            if (isGroup) {
                style.isGroupConversation = true
                style.conversationTitle = title
            }
        }

        private fun NotificationCompat.MessagingStyle.Message.withText(text: String): NotificationCompat.MessagingStyle.Message =
            NotificationCompat.MessagingStyle.Message(text, timestamp, person).also { it.extras.putAll(extras) }
    }
}
