package me.meeshy.sdk.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Une clé de détail se lit en CHAÎNE qu'elle voyage en chaîne ou en nombre (miroir de
 * `SocketNotificationDetailFields`, iOS) ; tout autre type (objet, tableau) vaut absent, sans
 * coûter la notification entière.
 */
@OptIn(ExperimentalSerializationApi::class)
internal object TolerantStringSerializer : KSerializer<String?> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): String? {
        val raw = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeString()
        return (raw as? JsonPrimitive)?.takeIf { raw !is JsonNull }?.content
    }

    override fun serialize(encoder: Encoder, value: String?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value)
    }
}

/**
 * Une clé du détail du message, lue dans `context` puis, à défaut, dans `metadata` (iOS
 * `detailFields = context.merging(fallback: metadata)`).
 */
public fun ApiNotification.detailField(key: String): String? =
    when (key) {
        "locationLat" -> context?.locationLat ?: metadata?.locationLat
        "locationLon" -> context?.locationLon ?: metadata?.locationLon
        "locationName" -> context?.locationName ?: metadata?.locationName
        "locationAddress" -> context?.locationAddress ?: metadata?.locationAddress
        "contactName" -> context?.contactName ?: metadata?.contactName
        "contactPhone" -> context?.contactPhone ?: metadata?.contactPhone
        "contactEmail" -> context?.contactEmail ?: metadata?.contactEmail
        "inviteUrl" -> context?.inviteUrl ?: metadata?.inviteUrl
        "inviteConversationTitle" -> context?.inviteConversationTitle ?: metadata?.inviteConversationTitle
        "inviteMemberCount" -> context?.inviteMemberCount ?: metadata?.inviteMemberCount
        "linkUrl" -> context?.linkUrl ?: metadata?.linkUrl
        "linkDomain" -> context?.linkDomain ?: metadata?.linkDomain
        "linkTitle" -> context?.linkTitle ?: metadata?.linkTitle
        "linkImageUrl" -> context?.linkImageUrl ?: metadata?.linkImageUrl
        "thumbnailUrl" -> context?.thumbnailUrl ?: metadata?.thumbnailUrl
        "storyReply" -> context?.storyReply ?: metadata?.storyReply
        "notificationLocKey" -> context?.notificationLocKey ?: metadata?.notificationLocKey
        else -> null
    }

/** Le message DÉCLARE une protection (`notificationLocKey` posé) : ni détail ni vignette ne voyagent. */
public val ApiNotification.declaresProtection: Boolean
    get() = NotificationMessageDetail.declaresProtection({ detailField(it) })

/** Le détail du message (position, contact, invitation, lien) — jamais pour un message protégé. */
public val ApiNotification.messageDetail: NotificationMessageDetail?
    get() = NotificationMessageDetail.ofUnprotected({ detailField(it) })
