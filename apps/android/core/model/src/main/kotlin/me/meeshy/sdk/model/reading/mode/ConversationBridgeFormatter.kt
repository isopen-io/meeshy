package me.meeshy.sdk.model.reading.mode

import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.ConversationBridge
import me.meeshy.sdk.model.ConversationBridgeData
import me.meeshy.sdk.model.ConversationBridgeMediaCounts

/** Vue minimale d'un attachement : seul le discriminant compte (`image|video|audio|file|location`, inconnu = fichier). */
public data class BridgeAttachment(val type: String)

/** Vue minimale d'un message du pont ; le nom d'auteur est résolu par l'appelant. */
public data class BridgeMessage(
    val senderId: String,
    val senderName: String,
    val attachments: List<BridgeAttachment> = emptyList(),
)

/** Fonction de traduction injectée : clé `lentille.bridge.*` + paramètres. */
public typealias BridgeTranslate = (key: String, params: Map<String, String>) -> String

/**
 * Pont ✦ déterministe — miroir EXACT de `buildBridgeData` / `formatBridge`
 * (`packages/shared/utils/conversation-bridge.ts`) et de `LentilleBridgeFormatter` (iOS). Rejoué contre
 * `fixtures/reading-modes/bridge.vectors.json`. La couche données ne connaît aucune langue.
 */
public object ConversationBridgeFormatter {
    private const val AUTHORS_ONE = "lentille.bridge.authorsOne"
    private const val AUTHORS_TWO = "lentille.bridge.authorsTwo"
    private const val AUTHORS_MORE = "lentille.bridge.authorsMore"
    private const val MESSAGES_ONE = "lentille.bridge.messagesOne"
    private const val MESSAGES_OTHER = "lentille.bridge.messagesOther"
    private const val MEDIA_IMAGES = "lentille.bridge.media.images"
    private const val MEDIA_AUDIO = "lentille.bridge.media.audio"
    private const val MEDIA_FILES = "lentille.bridge.media.files"
    private const val MAX_NAMED_AUTHORS = 2

    /** `null` si rien non lu ou si tout vient du lecteur : jamais un pont vide. */
    public fun buildBridgeData(messages: List<BridgeMessage>, viewerId: String, unreadCount: Int): ConversationBridgeData? {
        val fromOthers = messages.filter { it.senderId != viewerId }
        if (unreadCount == 0 || fromOthers.isEmpty()) return null

        val authorNames = fromOthers.distinctBy { it.senderId }.map { it.senderName }
        val attachments = fromOthers.flatMap { it.attachments }
        val images = attachments.count { it.type == "image" }
        val audio = attachments.count { it.type == "audio" }
        val files = attachments.size - images - audio
        val mediaCounts = if (images + audio + files > 0) {
            ConversationBridgeMediaCounts(
                images = images.takeIf { it > 0 },
                audio = audio.takeIf { it > 0 },
                files = files.takeIf { it > 0 },
            )
        } else {
            null
        }
        return ConversationBridgeData(
            authors = authorNames.take(MAX_NAMED_AUTHORS),
            extraAuthorCount = maxOf(0, authorNames.size - MAX_NAMED_AUTHORS),
            messageCount = fromOthers.size,
            mediaCounts = mediaCounts,
        )
    }

    public fun formatBridge(data: ConversationBridgeData, t: BridgeTranslate): String =
        listOfNotNull(authorsSegment(data, t), messagesSegment(data, t), mediaSegment(data, t))
            .filter { it.isNotBlank() }
            .joinToString(" · ")

    /**
     * Phrase de l'étage agent résolue par le Prisme du LECTEUR (rang d'origine avant traduction) ;
     * `null` ⇒ servir [ConversationBridge.text], l'original.
     */
    public fun resolveAgentText(bridge: ConversationBridge, preferredLanguages: List<String>): String? {
        val original = bridge.text ?: return null
        val translations = bridge.translations ?: return original
        return PrismTranslationResolver.resolve(bridge.originalLanguage, translations, preferredLanguages)?.text ?: original
    }

    /** Pont local : `focal` tant que les non-lus tiennent sous le plafond, sinon `resume`. */
    public fun suggestedMode(unreadCount: Int): String =
        if (unreadCount <= ReadingModeOrchestrator.UNREAD_CAP) ConversationBridge.MODE_FOCAL else ConversationBridge.MODE_RESUME

    private fun authorsSegment(data: ConversationBridgeData, t: BridgeTranslate): String? {
        val first = data.authors.getOrNull(0) ?: return null
        val second = data.authors.getOrNull(1)
        return when {
            second != null && data.extraAuthorCount > 0 ->
                t(AUTHORS_MORE, mapOf("a" to first, "b" to second, "count" to data.extraAuthorCount.toString()))
            second != null -> t(AUTHORS_TWO, mapOf("a" to first, "b" to second))
            else -> t(AUTHORS_ONE, mapOf("name" to first))
        }
    }

    private fun messagesSegment(data: ConversationBridgeData, t: BridgeTranslate): String? {
        if (data.messageCount <= 0) return null
        val key = if (data.messageCount == 1) MESSAGES_ONE else MESSAGES_OTHER
        return t(key, mapOf("count" to data.messageCount.toString()))
    }

    private fun mediaSegment(data: ConversationBridgeData, t: BridgeTranslate): String? {
        val counts = data.mediaCounts ?: return null
        val parts = listOf(MEDIA_IMAGES to counts.images, MEDIA_AUDIO to counts.audio, MEDIA_FILES to counts.files)
            .mapNotNull { (key, count) -> count?.takeIf { it > 0 }?.let { t(key, mapOf("count" to it.toString())) } }
        return parts.takeIf { it.isNotEmpty() }?.joinToString(", ")
    }
}
