package me.meeshy.sdk.model.lens

import me.meeshy.sdk.model.lens.LensLayers.optional
import me.meeshy.sdk.model.lens.LensVocabulary.Patterns

/**
 * Lecteur MeeshyLens v1. Miroir de `parseLens` (packages/shared/types/lens-format.ts) et de `LensFormat.swift`.
 * Ne lève jamais : un JSON illisible est [LensParseOutcome.Invalid]. Un document n'exécute et n'ouvre rien.
 */
public object LensFormat {

    /** Lit un texte JSON. */
    public fun parse(json: String): LensParseOutcome = LensJsonValue.parse(json)?.let { parse(it) } ?: LensParseOutcome.Invalid

    /** Même ordre que `parseLens` : version, interdits, enveloppe, couches. */
    public fun parse(input: LensJsonValue): LensParseOutcome {
        val root = (input as? LensJsonValue.Obj)?.fields ?: return LensParseOutcome.Invalid
        if (LensScan.exceedsDepth(input, LensVocabulary.MAX_DEPTH)) return LensParseOutcome.Invalid
        val rawSchema = (root["schema"] as? LensJsonValue.Num)?.value
        if (rawSchema == null || rawSchema != Math.rint(rawSchema) || rawSchema < 1.0 || rawSchema.isInfinite()) {
            return LensParseOutcome.Invalid
        }
        if (rawSchema > LensVocabulary.SCHEMA_VERSION) {
            return LensParseOutcome.UpdateRequired(if (rawSchema >= Int.MAX_VALUE) Int.MAX_VALUE else rawSchema.toInt())
        }
        val reasons = (LensScan.forbiddenReasons(input) + LensScan.forbiddenLayerReasons(root["layers"])).toSortedSet().toList()
        if (reasons.isNotEmpty()) return LensParseOutcome.Forbidden(reasons)
        val envelope = readEnvelope(root) ?: return LensParseOutcome.Invalid
        val layers = envelope.declaredLayers.mapNotNull(LensLayers::readLayer)
        val ids = layers.map { it.id }
        if (layers.size > LensVocabulary.MAX_LAYERS || ids.toSet().size != ids.size) return LensParseOutcome.Invalid
        val known = ids.toSet()
        val triggers = envelope.declaredTriggers.mapNotNull(LensLayers::readTrigger).filter { it.target in known }
        if (triggers.size > LensVocabulary.MAX_TRIGGERS) return LensParseOutcome.Invalid
        val document = LensDocument(
            id = envelope.id, name = envelope.name, names = envelope.names, credits = envelope.credits,
            surfaces = envelope.surfaces, cost = envelope.cost, window = envelope.window,
            layers = layers, triggers = triggers, fallbacks = envelope.fallbacks?.let { visible(it, known) },
        )
        return LensParseOutcome.Ok(
            document,
            ignoredLayers = envelope.declaredLayers.size - layers.size,
            ignoredTriggers = envelope.declaredTriggers.size - triggers.size,
        )
    }

    private fun visible(fallbacks: LensFallbacks, known: Set<String>): LensFallbacks {
        fun tier(tier: LensFallbackTier?) = tier?.let { LensFallbackTier(it.hide.filter(known::contains)) }
        return LensFallbacks(tier(fallbacks.reduced), tier(fallbacks.minimal))
    }

    private class Envelope(
        val id: String,
        val name: String,
        val names: Map<String, String>,
        val credits: LensCredits,
        val surfaces: List<LensSurface>,
        val cost: LensCost,
        val window: LensWindow,
        val declaredLayers: List<LensJsonValue>,
        val declaredTriggers: List<LensJsonValue>,
        val fallbacks: LensFallbacks?,
    )

    private fun readEnvelope(root: Map<String, LensJsonValue>): Envelope? {
        val id = LensLayers.slug(root["id"]) ?: return null
        val name = LensLayers.text(root["name"], LensVocabulary.MAX_NAME_LENGTH) ?: return null
        val credits = readCredits(root["credits"]) ?: return null
        val surfaces = readSurfaces(root["surfaces"]) ?: return null
        val cost = ((root["cost"] as? LensJsonValue.Str)?.value)?.let(LensCost::fromRaw) ?: return null
        val window = readWindow(root["window"]) ?: return null
        val declaredLayers = (root["layers"] as? LensJsonValue.Arr)?.items
            ?.takeIf { it.size in 1..LensVocabulary.MAX_DECLARED_LAYERS } ?: return null
        val names = optional(root, "names") { readNames(it) }
        val triggers = optional(root, "triggers") { value ->
            (value as? LensJsonValue.Arr)?.items?.takeIf { it.size <= LensVocabulary.MAX_DECLARED_TRIGGERS }
        }
        val fallbacks = optional(root, "fallbacks") { readFallbacks(it) }
        if (!names.isValid || !triggers.isValid || !fallbacks.isValid) return null
        return Envelope(
            id, name, names.value.orEmpty(), credits, surfaces, cost, window, declaredLayers,
            triggers.value.orEmpty(), fallbacks.value,
        )
    }

    private fun isoDate(value: LensJsonValue?): String? =
        (value as? LensJsonValue.Str)?.value?.takeIf(LensScan::isIsoDate)

    private fun readCredits(value: LensJsonValue?): LensCredits? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val author = LensLayers.text(fields["author"], LensVocabulary.MAX_AUTHOR_LENGTH) ?: return null
        val createdAt = isoDate(fields["createdAt"]) ?: return null
        val updatedAt = optional(fields, "updatedAt") { isoDate(it) }
        return if (updatedAt.isValid) LensCredits(author, createdAt, updatedAt.value) else null
    }

    private fun readSurfaces(value: LensJsonValue?): List<LensSurface>? {
        val items = (value as? LensJsonValue.Arr)?.items?.takeIf { it.isNotEmpty() } ?: return null
        val surfaces = items.mapNotNull { ((it as? LensJsonValue.Str)?.value)?.let(LensSurface::fromRaw) }
        return surfaces.takeIf { it.size == items.size && it.toSet().size == it.size }
    }

    private fun readNames(value: LensJsonValue): Map<String, String>? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val names = mutableMapOf<String, String>()
        for (language in LensVocabulary.languages.filter { it != "fr" }) {
            val entry = optional(fields, language) { LensLayers.text(it, LensVocabulary.MAX_NAME_LENGTH) }
            if (!entry.isValid) return null
            entry.value?.let { names[language] = it }
        }
        return names
    }

    private fun dateTime(value: LensJsonValue?): String? =
        (value as? LensJsonValue.Str)?.value?.takeIf(LensScan::isIsoDateTime)

    private fun readWindow(value: LensJsonValue?): LensWindow? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val startsAt = dateTime(fields["startsAt"]) ?: return null
        val endsAt = dateTime(fields["endsAt"])?.takeIf { it > startsAt } ?: return null
        val geo = optional(fields, "geo") { geoValue ->
            val geoFields = (geoValue as? LensJsonValue.Obj)?.fields ?: return@optional null
            LensLayers.codes(geoFields["countries"], Patterns.country, LensVocabulary.MAX_COUNTRIES)
        }
        val communities = optional(fields, "communities") {
            LensLayers.codes(it, Patterns.community, LensVocabulary.MAX_COMMUNITIES)
        }
        return if (geo.isValid && communities.isValid) LensWindow(startsAt, endsAt, geo.value, communities.value) else null
    }

    private fun readFallbacks(value: LensJsonValue): LensFallbacks? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val reduced = optional(fields, "reduced") { readTier(it) }
        val minimal = optional(fields, "minimal") { readTier(it) }
        return if (reduced.isValid && minimal.isValid) LensFallbacks(reduced.value, minimal.value) else null
    }

    private fun readTier(value: LensJsonValue): LensFallbackTier? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val items = (fields["hide"] as? LensJsonValue.Arr)?.items?.takeIf { it.size <= LensVocabulary.MAX_HIDDEN } ?: return null
        val ids = items.mapNotNull { LensLayers.slug(it) }
        return if (ids.size == items.size) LensFallbackTier(ids) else null
    }
}
