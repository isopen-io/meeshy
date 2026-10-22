package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * Un message système par sa CLÉ (`system.member-joined`, …) et ses paramètres — miroir
 * de `LastMessageSystemEvent` (iOS). Les paramètres sont lus comme du TEXTE : un nombre
 * ou un booléen du fil se relit par son écriture canonique.
 */
@Serializable
data class MessageSystemEvent(
    val key: String,
    val params: Map<String, String> = emptyMap(),
)

/**
 * Un lien sortant suivi par la passerelle : l'URL brute et le jeton de redirection.
 * Miroir de `TrackedLink` (iOS).
 */
@Serializable
data class TrackedLink(
    val url: String,
    val token: String,
)

/** `[url: jeton]` — le dernier jeton gagne sur une URL en double. */
val List<TrackedLink>.trackedLinkMap: Map<String, String>
    get() = associate { it.url to it.token }

/**
 * Lecture du blob libre `Message.metadata`, partagé par toutes les familles d'avis.
 *
 * Chaque lecteur VALIDE son `kind` au lieu de caster : un `kind` inconnu — publié par
 * une version plus récente — vaut `null`, jamais une erreur, et le message reste
 * affichable par son `content`.
 */
object MessageRichMetadata {

    fun kind(metadata: JsonObject?): String? = metadata.text("kind")

    fun callSummary(metadata: JsonObject?): CallSummaryMetadata? = CallSummaryMetadata.parse(metadata)

    fun joinNotice(metadata: JsonObject?): JoinNoticeMetadata? = JoinNoticeMetadata.parse(metadata)

    fun arrivalsNotice(metadata: JsonObject?): ArrivalsNoticeMetadata? = ArrivalsNoticeMetadata.parse(metadata)

    fun sticker(metadata: JsonObject?): MessageSticker? =
        MessageSticker.fromJson(metadata?.get("sticker"))?.ifWireWorthy

    /** Les liens suivis de l'enveloppe `metadata.trackingLinks` ; un élément malformé est écarté. */
    fun trackingLinks(metadata: JsonObject?): List<TrackedLink>? = parseTrackedLinks(metadata?.get("trackingLinks"))

    fun parseTrackedLinks(element: JsonElement?): List<TrackedLink>? {
        val array = element as? JsonArray ?: return null
        return array.mapNotNull { item ->
            val obj = item as? JsonObject ?: return@mapNotNull null
            val url = obj.text("url") ?: return@mapNotNull null
            val token = obj.text("token") ?: return@mapNotNull null
            TrackedLink(url = url, token = token)
        }
    }
}

internal fun JsonObject?.text(key: String): String? =
    ((this?.get(key)) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull

internal fun JsonObject?.flag(key: String): Boolean? =
    ((this?.get(key)) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.booleanOrNull

internal fun JsonObject?.number(key: String): Double? =
    ((this?.get(key)) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.doubleOrNull

/**
 * Champ `systemEvent` : tolérant. Une forme illisible vaut absence ; les paramètres
 * numériques ou booléens se relisent par leur écriture canonique.
 */
internal object TolerantSystemEventSerializer : KSerializer<MessageSystemEvent?> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): MessageSystemEvent? {
        val input = decoder as? JsonDecoder ?: return null
        val obj = input.decodeJsonElement() as? JsonObject ?: return null
        val key = obj.text("key") ?: return null
        val params = (obj["params"] as? JsonObject)
            ?.mapNotNull { (name, value) ->
                (value as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull?.let { name to it }
            }
            ?.toMap()
            .orEmpty()
        return MessageSystemEvent(key = key, params = params)
    }

    override fun serialize(encoder: Encoder, value: MessageSystemEvent?) {
        if (value == null) {
            encoder.encodeNull()
            return
        }
        encoder.encodeSerializableValue(MessageSystemEvent.serializer(), value)
    }
}
