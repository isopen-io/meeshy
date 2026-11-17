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
        val servedName = PushNotificationActions.senderName(payload) ?: return
        val showName = request.preferences.showSenderName
        val senderName = if (showName) servedName else context.getString(R.string.push_someone)
        val sender = Person.Builder()
            .setName(senderName)
            .setKey(if (showName) payload.senderId ?: servedName else "anonymous")
            .apply { if (showName) avatarOf(request)?.let(::setIcon) }
            .build()

        val style = NotificationCompat.MessagingStyle(Person.Builder().setName(context.getString(R.string.push_message_you)).build())
        val fresh = NotificationCompat.MessagingStyle.Message(
            text,
            PushNotificationActions.timestampMillis(payload, System.currentTimeMillis()),
            sender,
        ).also { message -> payload.messageId?.let { message.extras.putString(MESSAGE_ID_KEY, it) } }
        messagesOf(request, text, fresh).forEach(style::addMessage)
        if (!payload.isDirectConversation) {
            style.isGroupConversation = true
            style.conversationTitle = payload.conversationTitle
                ?.let { "${PushPresentationText.groupMarker(payload.conversationType)} $it".trim() }
                ?: request.push.notificationTitle
        }
        builder.setStyle(style)
        ConversationShortcutId.of(payload.conversationId)?.let(builder::setShortcutId)
    }

    /**
     * Les messages de la bannière : l'historique déjà posé puis le message reçu. Une CORRECTION (message modifié) ne
     * s'ajoute pas : elle remplace le texte du message qu'elle nomme, à sa place et sous son horodatage, sans empiler
     * l'ancien texte à côté du nouveau. Sans message reconnu (bannière posée avant que les messages portent leur
     * identité), l'historique reste tel quel ; sans historique lisible, le texte corrigé devient le seul message.
     */
    private fun messagesOf(
        request: EnrichmentRequest,
        served: String,
        fresh: NotificationCompat.MessagingStyle.Message,
    ): List<NotificationCompat.MessagingStyle.Message> {
        val payload = request.push.payload
        if (!payload.isCorrection) return previousMessages(request, served, MAX_HISTORY - 1) + fresh
        val history = previousMessages(request, served, MAX_HISTORY)
        val messageId = payload.messageId
        if (history.isEmpty()) return listOf(fresh)
        if (messageId == null) return history
        return history.map { message ->
            if (message.extras.getString(MESSAGE_ID_KEY) == messageId) message.withText(served) else message
        }
    }

    private fun NotificationCompat.MessagingStyle.Message.withText(text: String): NotificationCompat.MessagingStyle.Message =
        NotificationCompat.MessagingStyle.Message(text, timestamp, person).also { it.extras.putAll(extras) }

    /**
     * L'historique de la bannière déjà posée. Sous le scellé d'un verrou PIN, seuls les messages identiques au libellé
     * survivent : une bannière posée AVANT le verrou porte du texte en clair qui ne doit pas être recopié.
     */
    private fun previousMessages(request: EnrichmentRequest, served: String, limit: Int): List<NotificationCompat.MessagingStyle.Message> {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return emptyList()
        val previous = runCatching { manager.activeNotifications }.getOrNull()
            ?.firstOrNull { it.id == request.notificationId && it.tag == null }
            ?.notification ?: return emptyList()
        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(previous) ?: return emptyList()
        val sealed = PushConversationLockSeal.isSealed(request.push.payload)
        return style.messages.filter { !sealed || it.text.toString() == served }.takeLast(limit)
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
        /** L'identité du message sur sa bulle de bannière : la correction retrouve ainsi le texte qu'elle remplace. */
        private const val MESSAGE_ID_KEY = "meeshy.messageId"
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
