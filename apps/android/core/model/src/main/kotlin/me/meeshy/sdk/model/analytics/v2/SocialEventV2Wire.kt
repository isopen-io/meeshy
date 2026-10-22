package me.meeshy.sdk.model.analytics.v2

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Limites et encodage du fil v2 de `POST /api/v1/social/events`. Miroir de
 * `SocialEventsV2Wire` (iOS) et des bornes de `social-events-v2.ts`.
 *
 * Sur le fil un événement est PLAT : `type`, `action`, l'enveloppe, puis les
 * champs de sa famille. Aucune clé `null`, clés triées (octets stables au rejeu).
 */
object SocialEventV2Wire {
    const val MAX_EVENT_BYTES = 2_048
    const val MAX_EVENTS_PER_REQUEST = 200
    const val BATCH_SIZE = 50
    const val MAX_AGE_MS: Long = 72L * 3_600_000L
    const val REASON_CODE_MAX = 64
    const val NOTIFICATION_TYPE_MAX = 64
    const val VISIBLE_TARGETS_MAX = 10

    private val isoFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    fun isoString(epochMillis: Long): String = isoFormatter.format(Instant.ofEpochMilli(epochMillis))

    /** Une fraction 0..1 à deux décimales ; NaN et infini valent 0. */
    fun fraction(value: Double): Double {
        if (!value.isFinite()) return 0.0
        return Math.round(value.coerceIn(0.0, 1.0) * 100.0) / 100.0
    }

    /** Au-delà de 72 h la passerelle l'ignorerait : il ne part pas. */
    fun isFresh(occurredAtEpochMillis: Long, nowEpochMillis: Long): Boolean =
        nowEpochMillis - occurredAtEpochMillis <= MAX_AGE_MS

    /** Au plus 200 événements par requête. */
    fun <T> capBatch(events: List<T>): List<T> = events.take(MAX_EVENTS_PER_REQUEST)

    /** L'événement encodé, prêt à rester en file. Nul s'il dépasse 2 Kio. */
    fun encode(event: SocialEventV2): String? {
        val json = toJson(event).toString()
        return json.takeIf { it.toByteArray(Charsets.UTF_8).size <= MAX_EVENT_BYTES }
    }

    fun toJson(event: SocialEventV2): JsonObject {
        val fields = FieldsBuilder()
        fields.put("type", event.type.wire)
        fields.put("action", event.action)
        fields.put("eventId", event.eventId)
        fields.put("occurredAt", isoString(event.occurredAtEpochMillis))
        event.target?.let { fields.put("target", targetJson(it)) }
        fields.put("surface", event.surface)
        event.listing?.let { fields.put("listing", listingJson(it)) }
        event.prism?.let { fields.put("prism", prismJson(it)) }
        fields.putAll(event.payload.fields())
        return fields.build()
    }

    private fun refJson(ref: SocialTargetRef): JsonObject =
        FieldsBuilder().apply {
            put("kind", ref.kind.wire)
            put("id", ref.id)
        }.build()

    private fun targetJson(target: SocialTarget): JsonObject =
        FieldsBuilder().apply {
            put("kind", target.kind.wire)
            put("id", target.id)
            target.parent?.let { put("parent", refJson(it)) }
        }.build()

    private fun listingJson(listing: SocialListing): JsonObject =
        FieldsBuilder().apply {
            put("feedRequestId", listing.feedRequestId)
            put("position", listing.position)
            put("rankingSource", listing.rankingSource?.wire)
            put("listingSessionId", listing.listingSessionId)
        }.build()

    private fun prismJson(prism: SocialPrism): JsonObject =
        FieldsBuilder().apply {
            put("displayedLanguage", prism.displayedLanguage)
            put("originalLanguage", prism.originalLanguage)
            put("translated", prism.translated)
            put("translationSource", prism.translationSource?.wire)
        }.build()
}

/** Construit un objet JSON plat : une valeur nulle n'écrit AUCUNE clé, les clés sont triées. */
internal class FieldsBuilder {
    private val entries = sortedMapOf<String, JsonElement>()

    fun put(key: String, value: String?) { value?.let { entries[key] = JsonPrimitive(it) } }
    fun put(key: String, value: Int?) { value?.let { entries[key] = JsonPrimitive(it) } }
    fun put(key: String, value: Double?) { value?.let { entries[key] = JsonPrimitive(it) } }
    fun put(key: String, value: Boolean?) { value?.let { entries[key] = JsonPrimitive(it) } }
    fun put(key: String, value: JsonElement?) { if (value != null && value !is JsonNull) entries[key] = value }
    fun putInts(key: String, values: List<Int>) { entries[key] = JsonArray(values.map { JsonPrimitive(it) }) }
    fun putAll(other: Map<String, JsonElement>) { entries.putAll(other) }

    fun build(): JsonObject = JsonObject(entries.toMap())
}
