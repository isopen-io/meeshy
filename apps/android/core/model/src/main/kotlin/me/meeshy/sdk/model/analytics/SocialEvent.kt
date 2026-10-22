package me.meeshy.sdk.model.analytics

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * Un événement de lecture de `POST /social/events`.
 *
 * - [View] porte l'entrée de l'écran détail ; [Impression] son contexte de listing et sa
 *   visibilité (facultatifs) ; [Open] l'engagement d'ouverture AU TAP (ne compte aucune
 *   vue, part dans sa requête) ; [Dwell] / [DwellStart] une session de consommation.
 */
sealed interface SocialEvent {
    val postId: String

    data class View(
        override val postId: String,
        val durationMs: Int? = null,
        val surface: ContentSurface? = null,
        val entry: ContentEntry? = null,
    ) : SocialEvent

    data class Impression(
        override val postId: String,
        val source: String,
        val surface: ContentSurface? = null,
        val listing: SocialListing? = null,
        val visibility: SocialVisibility? = null,
    ) : SocialEvent

    data class Open(override val postId: String, val origin: OpenOrigin? = null) : SocialEvent

    data class Dwell(val session: EngagementSession) : SocialEvent {
        override val postId: String get() = session.postId
    }

    data class DwellStart(val session: EngagementSession) : SocialEvent {
        override val postId: String get() = session.postId
    }

    val isOpen: Boolean get() = this is Open
}

/** Un événement et son enveloppe, tels qu'ils vivent en file et partent à PLAT sur le fil. */
@kotlinx.serialization.Serializable(with = StampedSocialEventSerializer::class)
data class StampedSocialEvent(val event: SocialEvent, val stamp: SocialEventStamp) {
    val postId: String get() = event.postId
    val isOpen: Boolean get() = event.isOpen

    companion object {
        /** L'enveloppe posée à la CRÉATION ; un dwell garde l'identité et l'heure de sa séance. */
        fun stamping(
            event: SocialEvent,
            atMs: Long,
            newId: () -> String = SocialEventStamp::newEventId,
        ): StampedSocialEvent = StampedSocialEvent(
            event,
            when (event) {
                is SocialEvent.Dwell -> SocialEventStamp.of(event.session)
                is SocialEvent.DwellStart -> SocialEventStamp.startOf(event.session)
                else -> SocialEventStamp.minted(atMs, newId)
            },
        )
    }
}

internal val socialWireJson: Json = Json {
    encodeDefaults = false
    explicitNulls = false
    ignoreUnknownKeys = true
}

object StampedSocialEventSerializer : KSerializer<StampedSocialEvent> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun serialize(encoder: Encoder, value: StampedSocialEvent) {
        val out = encoder as? JsonEncoder ?: throw SerializationException("JSON requis")
        out.encodeJsonElement(SocialEventWire.encode(value))
    }

    override fun deserialize(decoder: Decoder): StampedSocialEvent {
        val input = decoder as? JsonDecoder ?: throw SerializationException("JSON requis")
        return SocialEventWire.decode(input.decodeJsonElement().jsonObject)
    }
}

/** Le fil de comptage : discriminant toujours écrit, aucune clé `null`, enveloppe aplatie. */
object SocialEventWire {

    fun encode(stamped: StampedSocialEvent): JsonObject = buildJsonObject {
        when (val event = stamped.event) {
            is SocialEvent.View -> {
                put("type", "view")
                put("postId", event.postId)
                event.durationMs?.let { put("durationMs", it) }
                event.surface?.let { put("surface", it.wire) }
                event.entry?.let {
                    put("provenance", it.provenance.wire)
                    it.origin?.let { origin -> put("origin", origin.wire) }
                }
            }
            is SocialEvent.Impression -> {
                put("type", "impression")
                put("postId", event.postId)
                put("source", event.source)
                event.surface?.let { put("surface", it.wire) }
                event.listing?.let { put("listing", socialWireJson.encodeToJsonElement(SocialListing.serializer(), it)) }
                event.visibility?.let { put("visibility", socialWireJson.encodeToJsonElement(SocialVisibility.serializer(), it)) }
            }
            is SocialEvent.Open -> {
                put("type", "open")
                put("postId", event.postId)
                event.origin?.let { put("origin", it.wire) }
            }
            is SocialEvent.Dwell -> putSession("dwell", event.session)
            is SocialEvent.DwellStart -> putSession("dwell-start", event.session)
        }
        put("eventId", stamped.stamp.eventId)
        stamped.stamp.occurredAtMs?.let { put("occurredAt", IsoUtc.format(it)) }
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.putSession(type: String, session: EngagementSession) {
        put("type", type)
        socialWireJson.encodeToJsonElement(EngagementSession.serializer(), session).jsonObject.forEach { (k, v) -> put(k, v) }
    }

    /** Tolérant : valeur d'énumération inconnue = absente ; événement sans enveloppe = identifiant neuf. */
    fun decode(obj: JsonObject): StampedSocialEvent {
        val event = decodeEvent(obj)
        val storedId = obj.string("eventId")
        val storedAt = obj.string("occurredAt")?.let(IsoUtc::parse)
        val stamp = when {
            storedId != null -> SocialEventStamp(storedId, storedAt)
            event is SocialEvent.Dwell -> SocialEventStamp.of(event.session)
            event is SocialEvent.DwellStart -> SocialEventStamp.startOf(event.session)
            else -> SocialEventStamp.minted(null)
        }
        return StampedSocialEvent(event, stamp)
    }

    private fun decodeEvent(obj: JsonObject): SocialEvent {
        val postId = obj.string("postId") ?: throw SerializationException("postId manquant")
        val surface = ContentSurface.fromWire(obj.string("surface"))
        val origin = OpenOrigin.fromWire(obj.string("origin"))
        return when (val type = obj.string("type")) {
            "view" -> SocialEvent.View(
                postId = postId,
                durationMs = (obj["durationMs"] as? JsonPrimitive)?.intOrNull,
                surface = surface,
                entry = ViewProvenance.fromWire(obj.string("provenance"))?.let { ContentEntry.of(it, origin) },
            )
            "impression" -> SocialEvent.Impression(
                postId = postId,
                source = obj.string("source") ?: "feed",
                surface = surface,
                listing = obj.lenient(SocialListing.serializer(), "listing"),
                visibility = obj.lenient(SocialVisibility.serializer(), "visibility"),
            )
            "open" -> SocialEvent.Open(postId, origin)
            "dwell" -> SocialEvent.Dwell(socialWireJson.decodeFromJsonElement(EngagementSession.serializer(), obj))
            "dwell-start" -> SocialEvent.DwellStart(socialWireJson.decodeFromJsonElement(EngagementSession.serializer(), obj))
            else -> throw SerializationException("type d'événement inconnu: $type")
        }
    }

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

    private fun <T> JsonObject.lenient(serializer: kotlinx.serialization.KSerializer<T>, key: String): T? =
        this[key]?.let { runCatching { socialWireJson.decodeFromJsonElement(serializer, it) }.getOrNull() }
}
