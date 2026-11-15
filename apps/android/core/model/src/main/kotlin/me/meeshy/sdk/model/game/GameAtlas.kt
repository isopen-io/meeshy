package me.meeshy.sdk.model.game

import me.meeshy.sdk.lang.LanguageCodeNormalizer

/**
 * L'ATLAS DES LANGUES (#9388) — miroir de `packages/shared/utils/game/atlas.ts` et de `GameAtlas`. Une langue est
 * TAMPONNÉE quand un message est envoyé ET un reçu avec quelqu'un qui l'écrit ; la langue d'un événement est celle
 * de la PERSONNE d'en face. Le catalogue est celui des langues servies par la passerelle
 * (`SUPPORTED_LANGUAGE_CODES`), comparé par test. Un code hors catalogue n'inscrit rien.
 */
public data class AtlasEntry(
    val sent: Boolean,
    val received: Boolean,
    /** Le jour où le tampon s'est posé, `null` tant qu'il manque un sens. */
    val stampedOn: String?,
)

public enum class AtlasEventKind { Sent, Received }

public data class AtlasEvent(val kind: AtlasEventKind, val language: String, val dayKey: String)

public data class AtlasStep(
    val state: Map<String, AtlasEntry>,
    /** La langue qui vient d'être tamponnée, `null` sinon. */
    val stamped: String?,
)

public data class AtlasSummary(
    val stamped: Int,
    val total: Int,
    val remaining: Int,
    /** Du plus ancien au plus récent ; à jour égal, dans l'ordre du catalogue. */
    val stamps: List<AtlasStamp>,
    /** Les échanges à moitié faits : un sens manque encore. */
    val pending: List<AtlasPending>,
)

public object GameAtlas {
    /** Les langues servies, dans l'ordre du catalogue de la passerelle. */
    public val catalog: List<String> = listOf(
        "en", "fr", "es", "de", "it", "pt", "nl", "pl", "ru", "uk",
        "cs", "ro", "hu", "bg", "hr", "el", "tr", "sv", "da", "fi",
        "no", "lt", "hy", "ar", "he", "fa", "hi", "bn", "ur", "th",
        "vi", "id", "ms", "ja", "ko", "zh", "am", "sw", "yo", "ha",
        "rw", "rn", "sn", "lg", "om", "ti", "ny", "ee", "mg", "so",
        "ln", "ig", "zu", "xh", "af", "wo", "bas", "ksf", "nnh", "dua",
        "ewo", "sk", "sl", "sr", "ca", "et", "lv", "az", "kk", "uz",
        "ka", "ta", "ne", "my", "km", "lo", "tl", "ff", "tw", "ak",
        "bm", "byv", "fan",
    )

    public val total: Int get() = catalog.size

    private val catalogSet: Set<String> = catalog.toSet()
    private val catalogOrder: Map<String, Int> = catalog.withIndex().associate { it.value to it.index }

    /** La langue servie d'un code, `null` hors du catalogue. */
    public fun language(code: String?): String? {
        if (code == null) return null
        val primary = code.trim().split('-', '_').firstOrNull { it.isNotEmpty() }?.lowercase().orEmpty()
        if (primary in catalogSet) return primary
        val normalized = LanguageCodeNormalizer.normalize(code) ?: return null
        return normalized.takeIf { it in catalogSet }
    }

    public fun apply(event: AtlasEvent, state: Map<String, AtlasEntry>): AtlasStep {
        val language = language(event.language) ?: return AtlasStep(state, null)
        val before = state[language] ?: AtlasEntry(sent = false, received = false, stampedOn = null)
        val sent = before.sent || event.kind == AtlasEventKind.Sent
        val received = before.received || event.kind == AtlasEventKind.Received
        val justStamped = before.stampedOn == null && sent && received
        val entry = AtlasEntry(sent, received, if (justStamped) event.dayKey else before.stampedOn)
        return AtlasStep(state + (language to entry), if (justStamped) language else null)
    }

    /** Rejoue une suite d'événements datés. */
    public fun fold(events: List<AtlasEvent>, from: Map<String, AtlasEntry> = emptyMap()): Map<String, AtlasEntry> =
        events.fold(from) { state, event -> apply(event, state).state }

    private fun indexOf(language: String): Int = catalogOrder[language] ?: Int.MAX_VALUE

    public fun summary(state: Map<String, AtlasEntry>): AtlasSummary {
        val entries = state.entries.sortedBy { indexOf(it.key) }
        val stamps = entries
            .mapNotNull { (language, entry) -> entry.stampedOn?.let { AtlasStamp(language, it) } }
            .sortedWith(compareBy<AtlasStamp> { it.stampedOn }.thenBy { indexOf(it.language) })
        val pending = entries
            .filter { it.value.stampedOn == null }
            .map { AtlasPending(it.key, it.value.sent, it.value.received) }
        return AtlasSummary(stamps.size, total, total - stamps.size, stamps, pending)
    }
}
