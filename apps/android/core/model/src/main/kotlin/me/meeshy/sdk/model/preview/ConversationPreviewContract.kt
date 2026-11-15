package me.meeshy.sdk.model.preview

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.serialization.TolerantSerializer

/*
 * Le contrat de la LIGNE D'APERÇU d'une conversation (#7545), miroir Kotlin de
 * `ConversationPreviewContract.swift` et de `packages/shared/types/conversation-preview.ts`.
 *
 * Porté à l'identique par `GET /conversations` (sur `lastMessage` et sur la conversation) et par
 * `conversation:updated` (clés plates `lastMessage*`, `lastReaction`, `activeCall`). Trois règles :
 * rien de protégé ne voyage (un dernier message protégé arrive SANS texte, traduction ni pièce) ;
 * rien de localisé ne voyage (des CLÉS et des paramètres) ; un détail absent est `null`, jamais 0.
 *
 * Les vocabulaires (`kind`, `outcome`, `key`, `excerptProtection`) restent des CHAÎNES : une valeur
 * inconnue d'un client ancien se décode au lieu de jeter la ligne.
 */

/** Un paramètre d'événement système : `string | number` sur le fil. */
@Serializable(with = PreviewParamSerializer::class)
sealed interface PreviewParam {
    data class Text(val value: String) : PreviewParam
    data class Number(val value: Double) : PreviewParam

    /** La valeur telle qu'elle s'insère dans un libellé : un entier sans « .0 ». */
    val rendered: String
        get() = when (this) {
            is Text -> value
            is Number -> if (value == Math.rint(value) && !value.isInfinite()) value.toLong().toString() else value.toString()
        }
}

internal object PreviewParamSerializer : KSerializer<PreviewParam> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): PreviewParam {
        val element = (decoder as JsonDecoder).decodeJsonElement()
        return requireNotNull(previewParamOrNull(element)) { "PreviewParam: ni chaîne ni nombre" }
    }

    override fun serialize(encoder: Encoder, value: PreviewParam) {
        when (value) {
            is PreviewParam.Text -> encoder.encodeString(value.value)
            is PreviewParam.Number -> encoder.encodeDouble(value.value)
        }
    }
}

internal fun previewParamOrNull(element: JsonElement): PreviewParam? {
    val primitive = element as? JsonPrimitive ?: return null
    if (element is JsonNull) return null
    if (primitive.isString) return PreviewParam.Text(primitive.content)
    return primitive.doubleOrNull?.let(PreviewParam::Number)
}

/** Les paramètres d'un événement : une entrée malformée est écartée, les autres sont gardées. */
internal object LossyPreviewParamsSerializer : KSerializer<Map<String, PreviewParam>> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): Map<String, PreviewParam> {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() as? JsonObject ?: return emptyMap()
        return element.mapNotNull { (key, value) -> previewParamOrNull(value)?.let { key to it } }.toMap()
    }

    override fun serialize(encoder: Encoder, value: Map<String, PreviewParam>) {
        val json = encoder as? JsonEncoder
        if (json == null) {
            encoder.encodeSerializableValue(MapSerializer(String.serializer(), PreviewParamSerializer), value)
            return
        }
        json.encodeJsonElement(
            buildJsonObject {
                value.forEach { (key, param) ->
                    when (param) {
                        is PreviewParam.Text -> put(key, param.value)
                        is PreviewParam.Number -> put(key, param.value)
                    }
                }
            },
        )
    }
}

/**
 * Le résumé de TOUTES les pièces jointes du dernier message. [kinds] compte par famille
 * (`image`, `video`, `audio`, `file`) ; une famille absente vaut 0.
 */
@Serializable
data class LastMessageAttachmentSummary(
    val count: Int = 0,
    val kinds: Map<String, Int> = emptyMap(),
    val totalSize: Long? = null,
)

/**
 * Un appel terminé — ou `outcome == "ongoing"` — dont la synthèse est le dernier message.
 * Lu depuis les métadonnées, jamais depuis le texte stocké.
 */
@Serializable
data class LastMessageCallSummary(
    val callId: String,
    /** `audio` | `video`. */
    val kind: String,
    /** `completed` | `missed` | `rejected` | `failed` | `ongoing`. */
    val outcome: String,
    val durationSec: Int = 0,
    /** `User.id` de l'appelant — comparé au lecteur pour la flèche. */
    val initiatorId: String,
    val endedByInitiator: Boolean = false,
)

/** Un message système, par sa CLÉ (`system.member-joined`, …) et ses paramètres. */
@Serializable
data class LastMessageSystemEvent(
    val key: String,
    @Serializable(with = LossyPreviewParamsSerializer::class)
    val params: Map<String, PreviewParam> = emptyMap(),
)

/**
 * Le sticker hissé de `metadata.sticker` : sa PRÉSENCE fait du message un sticker, quel que soit son
 * `messageType` (un sticker part en `image` avec sa PNG jointe). Tolérant par champ : `{stickerId}`
 * seul se décode en un sticker sans gabarit ni emoji.
 */
@Serializable(with = ConversationPreviewStickerSerializer::class)
data class ConversationPreviewSticker(
    val templateId: String? = null,
    val emoji: String? = null,
)

internal object ConversationPreviewStickerSerializer : KSerializer<ConversationPreviewSticker> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): ConversationPreviewSticker {
        val obj = (decoder as JsonDecoder).decodeJsonElement() as? JsonObject
            ?: throw IllegalArgumentException("sticker: objet attendu")
        fun text(key: String): String? = (obj[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
        return ConversationPreviewSticker(templateId = text("templateId"), emoji = text("emoji"))
    }

    override fun serialize(encoder: Encoder, value: ConversationPreviewSticker) {
        val json = encoder as? JsonEncoder ?: return encoder.encodeNull()
        json.encodeJsonElement(
            buildJsonObject {
                value.templateId?.let { put("templateId", it) }
                value.emoji?.let { put("emoji", it) }
            },
        )
    }
}

/**
 * La DERNIÈRE réaction posée dans la conversation, résolue pour le lecteur. [reactorUserId] et
 * [targetSenderUserId] sont les `User.id` qu'un client compare au sien (« Vous avez réagi »,
 * « à votre message »). [createdAt] reste l'instant ISO 8601 du fil.
 */
@Serializable
data class ConversationLastReaction(
    val emoji: String,
    val reactorId: String,
    val reactorUserId: String? = null,
    val reactorName: String,
    val messageId: String,
    val targetSenderId: String? = null,
    val targetSenderUserId: String? = null,
    val excerpt: String? = null,
    val excerptOriginalLanguage: String? = null,
    val excerptTranslations: Map<String, String>? = null,
    /** `expired` | `view-once` | `blurred` | `encrypted` | `ephemeral`. */
    val excerptProtection: String? = null,
    val createdAt: String,
) {
    /** La réaction vise-t-elle un message du lecteur ? Un lecteur inconnu ne s'attribue rien. */
    fun targets(readerId: String): Boolean = readerId.isNotEmpty() && targetSenderUserId == readerId
}

/** L'appel EN COURS dans la conversation. */
@Serializable
data class ConversationActiveCall(
    val id: String,
    /** `audio` | `video`. */
    val kind: String,
    val participantCount: Int = 0,
    val startedAt: String,
)

internal object TolerantAttachmentSummarySerializer :
    KSerializer<LastMessageAttachmentSummary?> by TolerantSerializer(LastMessageAttachmentSummary.serializer())

internal object TolerantCallSummarySerializer :
    KSerializer<LastMessageCallSummary?> by TolerantSerializer(LastMessageCallSummary.serializer())

internal object TolerantSystemEventSerializer :
    KSerializer<LastMessageSystemEvent?> by TolerantSerializer(LastMessageSystemEvent.serializer())

internal object TolerantPreviewStickerSerializer :
    KSerializer<ConversationPreviewSticker?> by TolerantSerializer(ConversationPreviewSticker.serializer())

internal object TolerantLastReactionSerializer :
    KSerializer<ConversationLastReaction?> by TolerantSerializer(ConversationLastReaction.serializer())

internal object TolerantActiveCallSerializer :
    KSerializer<ConversationActiveCall?> by TolerantSerializer(ConversationActiveCall.serializer())
