package me.meeshy.sdk.model.socket

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.SharedPlace

/** L'événement et la charge d'un envoi de message par la socket. */
data class SocketSendPayload(val event: String, val body: JsonObject)

/**
 * La charge du repli socket d'un envoi REST échoué (miroir de `MessageSocketManager.sendViaSocketFallback`, iOS) :
 * le MÊME `clientMessageId` que le REST, donc le dédoublonnage de la passerelle `(conversationId, clientMessageId)`
 * empêche un doublon si le REST avait réussi côté serveur.
 *
 * Fail-closed : `null` quand la socket ne sait pas transporter le message sans le dégrader — un texte chiffré sans pièce
 * jointe (jamais réémis en clair, la ligne reste en file) et une réponse qui cite une pièce nommée (le REST seul la porte).
 */
object SocketSendPayloads {

    fun from(conversationId: String, request: SendMessageRequest): SocketSendPayload? {
        val attachmentIds = request.attachmentIds.orEmpty()
        val encrypted = request.isEncrypted == true
        if (attachmentIds.isEmpty() && encrypted) return null
        if (request.attachmentReplyTo != null) return null
        val withAttachments = attachmentIds.isNotEmpty()
        val body = buildJsonObject {
            put("conversationId", conversationId)
            put("content", request.content)
            put("clientMessageId", request.clientMessageId)
            put("originalLanguage", request.originalLanguage)
            put("messageType", request.messageType)
            if (withAttachments) {
                put("attachmentIds", JsonArray(attachmentIds.map { id -> JsonPrimitive(id) }))
                put("isEncrypted", encrypted)
            }
            request.encryptionMode?.takeIf { withAttachments }?.let { put("encryptionMode", it) }
            request.replyToId?.let { put("replyToId", it) }
            request.storyReplyToId?.let { put("storyReplyToId", it) }
            request.forwardedFromId?.let { put("forwardedFromId", it) }
            request.forwardedFromConversationId?.let { put("forwardedFromConversationId", it) }
            request.forwardedAttachmentIds?.let { put("forwardedAttachmentIds", JsonArray(it.map { id -> JsonPrimitive(id) })) }
            request.copyAttachmentsFromMessageId?.let { put("copyAttachmentsFromMessageId", it) }
            request.isBlurred?.let { put("isBlurred", it) }
            request.expiresAt?.let { put("expiresAt", it) }
            request.ephemeralDuration?.let { put("ephemeralDuration", it) }
            request.effectFlags?.let { put("effectFlags", it) }
            request.isViewOnce?.let { put("isViewOnce", it) }
            request.maxViewOnceCount?.let { put("maxViewOnceCount", it) }
            request.location?.let { put("location", it.toWire()) }
            request.sticker?.let { put("sticker", it.toWire()) }
        }
        val event = if (withAttachments) SocketEventNames.MESSAGE_SEND_WITH_ATTACHMENTS else SocketEventNames.MESSAGE_SEND
        return SocketSendPayload(event, body)
    }

    private fun SharedPlace.toWire(): JsonElement = buildJsonObject {
        put("latitude", latitude)
        put("longitude", longitude)
        name?.let { put("name", it) }
        address?.let { put("address", it) }
        category?.let { put("category", it) }
    }

    private fun MessageSticker.toWire(): JsonElement = buildJsonObject {
        templateId?.let { put("templateId", it) }
        if (slots.isNotEmpty()) put("slots", JsonObject(slots.mapValues { JsonPrimitive(it.value) }))
        animation?.let { put("animation", it.wireName) }
        emoji?.let { put("emoji", it) }
        stickerId?.let { put("stickerId", it) }
    }
}
