package me.meeshy.sdk.model

import java.time.OffsetDateTime
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.intOrNull

/**
 * Décodage de `GET /anonymous/link/:identifier`, miroir de `ShareLinkInfo.init(from:)` (iOS) :
 * les droits invités arrivent à plat (`allowAnonymous*`, `allowViewHistory`) et se résolvent
 * par les défauts du schéma quand une passerelle ancienne les omet ; `expiresAt` ISO-8601 est
 * typé en millisecondes epoch (illisible = sans échéance, jamais un échec du document).
 */
internal object ShareLinkInfoSerializer : KSerializer<ShareLinkInfo> {
    @Serializable
    private class Shadow(val unused: String? = null)

    override val descriptor: SerialDescriptor = Shadow.serializer().descriptor

    override fun deserialize(decoder: Decoder): ShareLinkInfo {
        val input = decoder as JsonDecoder
        val o = input.decodeJsonElement() as JsonObject
        val json = input.json
        fun str(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
        fun int(k: String) = (o[k] as? JsonPrimitive)?.intOrNull
        fun bool(k: String) = (o[k] as? JsonPrimitive)?.booleanOrNull
        return ShareLinkInfo(
            id = str("id") ?: "",
            linkId = str("linkId") ?: "",
            name = str("name"),
            description = str("description"),
            expiresAt = str("expiresAt")?.let(::parseInstantMillis),
            maxUses = int("maxUses"),
            currentUses = int("currentUses") ?: 0,
            maxConcurrentUsers = int("maxConcurrentUsers"),
            currentConcurrentUsers = int("currentConcurrentUsers") ?: 0,
            requireAccount = bool("requireAccount") ?: false,
            requireNickname = bool("requireNickname") ?: false,
            requireEmail = bool("requireEmail") ?: false,
            requireBirthday = bool("requireBirthday") ?: false,
            allowedLanguages = o["allowedLanguages"]?.let {
                runCatching { json.decodeFromJsonElement(ListSerializer(String.serializer()), it) }.getOrNull()
            } ?: emptyList(),
            guestRights = ShareLinkGuestRights.resolving(
                messages = bool("allowAnonymousMessages"),
                images = bool("allowAnonymousImages"),
                files = bool("allowAnonymousFiles"),
                history = bool("allowViewHistory"),
            ),
            conversation = o["conversation"]?.let {
                runCatching { json.decodeFromJsonElement<ShareLinkConversation>(it) }.getOrNull()
            },
            creator = o["creator"]?.let {
                runCatching { json.decodeFromJsonElement<ShareLinkCreator>(it) }.getOrNull()
            },
            stats = o["stats"]?.let {
                runCatching { json.decodeFromJsonElement<ShareLinkStats>(it) }.getOrNull()
            },
        )
    }

    override fun serialize(encoder: Encoder, value: ShareLinkInfo) {
        throw UnsupportedOperationException("ShareLinkInfo est lu de la passerelle, jamais écrit.")
    }

    private fun parseInstantMillis(raw: String): Long? =
        runCatching { OffsetDateTime.parse(raw).toInstant().toEpochMilli() }.getOrNull()
}
