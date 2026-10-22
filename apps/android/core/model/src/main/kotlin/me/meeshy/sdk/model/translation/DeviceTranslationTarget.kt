package me.meeshy.sdk.model.translation

import me.meeshy.sdk.lang.LanguageCodeNormalizer

/** Un couple (langue de départ, langue d'arrivée) que le moteur de l'appareil sait traduire, normalisés. */
public data class DeviceTranslationPair(val source: String, val target: String)

/** Les rangs du Prisme qu'il reste à servir : la langue de départ et les arrivées à essayer DANS L'ORDRE. */
public data class DeviceTranslationCandidates(val source: String, val targets: List<String>)

/**
 * La langue que l'appareil calcule (#9899) : la descente du Prisme lue à l'envers — non pas quel
 * rang est SERVI, mais quels rangs PLUS HAUTS l'appareil peut encore servir. Miroir de
 * `DeviceTranslationTarget` (iOS) et de `deviceTranslationTarget` (web).
 */
public object DeviceTranslationTarget {

    /**
     * Les langues d'arrivée à essayer, ou `null` quand il n'y a rien à calculer. Un rang déjà
     * servi — par une traduction ou parce que le message est écrit dans cette langue — arrête la
     * descente. Sans langue d'origine connue, rien n'est calculé.
     */
    public fun candidates(
        preferredLanguages: List<String>,
        originalLanguage: String?,
        translatedLanguages: List<String>,
    ): DeviceTranslationCandidates? {
        if (originalLanguage.isNullOrBlank()) return null
        val source = LanguageCodeNormalizer.normalizeForDedup(originalLanguage)
        val served = translatedLanguages.map(LanguageCodeNormalizer::normalizeForDedup).toSet()
        val targets = mutableListOf<String>()
        for (rank in preferredLanguages.filter { it.isNotBlank() }) {
            val target = LanguageCodeNormalizer.normalizeForDedup(rank)
            if (target == source || target in served) break
            if (target !in targets) targets += target
        }
        return targets.takeIf { it.isNotEmpty() }?.let { DeviceTranslationCandidates(source, it) }
    }

    /** Le premier rang que l'appareil sait traduire ; un rang que le moteur ne sait pas est sauté. */
    public fun resolve(
        preferredLanguages: List<String>,
        originalLanguage: String?,
        translatedLanguages: List<String>,
        canTranslate: (source: String, target: String) -> Boolean,
    ): DeviceTranslationPair? {
        val descent = candidates(preferredLanguages, originalLanguage, translatedLanguages) ?: return null
        return descent.targets.firstOrNull { canTranslate(descent.source, it) }
            ?.let { DeviceTranslationPair(descent.source, it) }
    }

    /**
     * Le rang du lecteur qui porte [target], ÉCRIT comme il l'a configuré (`pt-BR`) : une
     * traduction posée sous la seule forme normalisée ne s'afficherait jamais pour lui.
     */
    public fun readerSpelling(target: String, preferredLanguages: List<String>): String =
        preferredLanguages.firstOrNull {
            it.isNotBlank() && LanguageCodeNormalizer.normalizeForDedup(it) == target
        } ?: target
}
