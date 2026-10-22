package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.SerialKind
import kotlinx.serialization.descriptors.StructureKind
import kotlinx.serialization.descriptors.elementNames
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/*
 * Tolerant, field-by-field decoding of the preference blocks (#11616) — port of the contract iOS
 * writes by hand in every block's `init(from:)` (`decodeIfPresent(...) ?? defaults.x`).
 *
 * kotlinx fails on the DOCUMENT: one boolean carried as a string, one enum token a newer client
 * wrote, one number where a string belongs, and the whole block degrades to its defaults — every
 * setting the user had made in it, lost for a single odd field. Here each declared field is
 * checked against the TYPE its serializer descriptor announces; a field that is absent or of an
 * unexpected type is left out, so the data class falls back to ITS OWN default and its siblings
 * are untouched. The check reads the descriptor, so a field added to a block is covered without
 * touching this file.
 *
 * What the block does not declare is not lost: an unknown key is folded, with the declared
 * `extras` object, into `extras` — the single place a client keeps what it cannot interpret yet —
 * and the storage codec writes it back as it came. The one exception is a RETIRED key, recognised
 * only to be left out (the dead calls alias, [RETIRED_PRIVACY_KEYS]).
 */
private const val EXTRAS_KEY = "extras"

/** Keys a block once carried that no gateway reads any more: understood, never adopted, never kept. */
private val RETIRED_PRIVACY_KEYS = setOf("allowCallsFromNonContacts")

/** The gateway refuses the whole notification category outside UTC-12 h..UTC+14 h (`dndUtcOffsetMinutes`, GW7). */
private val DND_UTC_OFFSET_RANGE = -720..840

/** The five stamps the gateway declares `z.never` on the application category (#4180, #6624). */
private val APPLICATION_CONSENT_KEYS = setOf(
    "dataProcessingConsentAt",
    "voiceDataConsentAt",
    "voiceProfileConsentAt",
    "voiceCloningConsentAt",
    "voiceCloningEnabledAt",
)

private val syncJson = Json {
    encodeDefaults = true
    explicitNulls = false
}

/** Decodes a privacy block from [element]; anything that is not an object is the defaults. */
public fun privacyPreferencesFromJson(element: JsonElement?): PrivacyPreferences =
    decodeTolerantBlock(PrivacyPreferences.serializer(), element, RETIRED_PRIVACY_KEYS)
        ?: PrivacyPreferences()

/**
 * Decodes a notification block from [element]. An offset outside what the gateway accepts is the
 * default: adopting it would make every later notification PATCH bounce with a 400.
 */
public fun notificationPreferencesFromJson(element: JsonElement?): UserNotificationPreferences {
    val decoded = decodeTolerantBlock(UserNotificationPreferences.serializer(), element)
        ?: return UserNotificationPreferences()
    if (decoded.dndUtcOffsetMinutes in DND_UTC_OFFSET_RANGE) return decoded
    return decoded.copy(dndUtcOffsetMinutes = UserNotificationPreferences().dndUtcOffsetMinutes)
}

/** Decodes an application block from [element], consent stamps included (read-only, see [toSyncJson]). */
public fun applicationPreferencesFromJson(element: JsonElement?): ApplicationPreferences =
    decodeTolerantBlock(ApplicationPreferences.serializer(), element) ?: ApplicationPreferences()

/**
 * The body of `PATCH /me/preferences/application`: every editable field, `extras` included, and
 * NONE of the five consent stamps — one of them in the body refuses the whole category (#6624).
 * Defaults are encoded on purpose: a partial-merge PATCH that dropped a field equal to its default
 * would leave the server on the old value while the screen shows the new one.
 */
public fun ApplicationPreferences.toSyncJson(): JsonObject =
    JsonObject(
        syncJson.encodeToJsonElement(ApplicationPreferences.serializer(), this).jsonObject -
            APPLICATION_CONSENT_KEYS,
    )

/** Parses a persisted token; blank, absent or malformed is `null` (the caller's defaults). */
internal fun parseStoredBlock(json: Json, raw: String?): JsonElement? {
    val trimmed = raw?.trim()
    if (trimmed.isNullOrEmpty()) return null
    return runCatching { json.parseToJsonElement(trimmed) }.getOrNull()
}

private fun <T> decodeTolerantBlock(
    serializer: KSerializer<T>,
    element: JsonElement?,
    retiredKeys: Set<String> = emptySet(),
): T? {
    val source = element as? JsonObject ?: return null
    val descriptor = serializer.descriptor
    val declared = (0 until descriptor.elementsCount).associate {
        descriptor.getElementName(it) to descriptor.getElementDescriptor(it)
    }
    val typed = declared
        .filterKeys { it != EXTRAS_KEY }
        .mapNotNull { (name, fieldDescriptor) ->
            source[name]?.let(fieldDescriptor::acceptedOrNull)?.let { name to it }
        }
        .toMap()
    val unknown = source.filterKeys { it !in declared && it !in retiredKeys }
    val declaredExtras = (source[EXTRAS_KEY] as? JsonObject).orEmpty()
    val sanitized = JsonObject(typed + (EXTRAS_KEY to JsonObject(unknown + declaredExtras)))
    return runCatching { Json.decodeFromJsonElement(serializer, sanitized) }.getOrNull()
}

/**
 * [value] as this field can hold it, or `null` when its type is not the one announced. A kind this
 * helper does not vet (a nested class, a map) passes through unchanged: dropping what cannot be
 * judged would silently lose it.
 */
private fun SerialDescriptor.acceptedOrNull(value: JsonElement): JsonElement? {
    if (value is JsonNull) return value.takeIf { isNullable }
    return when (kind) {
        PrimitiveKind.BOOLEAN -> value.takeIfLiteral { it.booleanOrNull != null }
        PrimitiveKind.INT -> value.takeIfLiteral { it.intOrNull != null }
        PrimitiveKind.LONG -> value.takeIfLiteral { it.longOrNull != null }
        PrimitiveKind.DOUBLE -> value.takeIfLiteral { it.doubleOrNull != null }
        PrimitiveKind.STRING -> value.takeIf { it is JsonPrimitive && it.isString }
        SerialKind.ENUM -> value.takeIf { it is JsonPrimitive && it.isString && it.content in elementNames }
        StructureKind.LIST -> (value as? JsonArray)?.let { array ->
            val item = getElementDescriptor(0)
            JsonArray(array.mapNotNull(item::acceptedOrNull))
        }
        else -> value
    }
}

private inline fun JsonElement.takeIfLiteral(accepts: (JsonPrimitive) -> Boolean): JsonElement? =
    takeIf { it is JsonPrimitive && !it.isString && accepts(it) }
