package me.meeshy.sdk.conversation

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.ApiMessage

/**
 * **Ce que la requête d'un envoi porte et que la bulle locale ne montre pas, gardé sur la bulle** (étend
 * [ForwardedPieces]). Si la ligne d'outbox disparaît et que l'auteur touche « Réessayer », la requête est reconstruite
 * depuis la bulle : sans cette trace elle perdrait la durée éphémère (la bulle n'a que l'échéance locale d'affichage), la
 * pièce citée et la source d'un partage. La trace vit dans `metadata` de la bulle locale, que la ligne du serveur remplace
 * à l'accusé.
 */
internal data class SendTrace(
    val forwardedAttachmentIds: List<String>? = null,
    val ephemeralDuration: Int? = null,
    val attachmentReplyToId: String? = null,
    val copyAttachmentsFromMessageId: String? = null,
) {
    fun stamp(): JsonObject? {
        val entries = LinkedHashMap<String, kotlinx.serialization.json.JsonElement>()
        ForwardedPieces.stamp(forwardedAttachmentIds)?.let { entries.putAll(it) }
        ephemeralDuration?.let { entries[DURATION] = JsonPrimitive(it) }
        attachmentReplyToId?.takeIf { it.isNotEmpty() }
            ?.let { entries[CITED] = JsonObject(mapOf(CITED_ID to JsonPrimitive(it))) }
        copyAttachmentsFromMessageId?.takeIf { it.isNotEmpty() }?.let { entries[COPY] = JsonPrimitive(it) }
        return entries.takeIf { it.isNotEmpty() }?.let(::JsonObject)
    }

    companion object {
        private const val DURATION = "ephemeralDuration"
        private const val CITED = "attachmentReplyTo"
        private const val CITED_ID = "attachmentId"
        private const val COPY = "copyAttachmentsFromMessageId"

        fun read(message: ApiMessage): SendTrace {
            val meta = message.metadata
            return SendTrace(
                forwardedAttachmentIds = ForwardedPieces.read(message),
                ephemeralDuration = (meta?.get(DURATION) as? JsonPrimitive)?.intOrNull,
                attachmentReplyToId = runCatching { (meta?.get(CITED)?.jsonObject?.get(CITED_ID) as? JsonPrimitive)?.contentOrNull }.getOrNull(),
                copyAttachmentsFromMessageId = (meta?.get(COPY) as? JsonPrimitive)?.contentOrNull,
            )
        }
    }
}
