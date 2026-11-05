package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.ReaderPrism

/**
 * L'ordre des langues de l'explorateur d'un message — décision tranchée : les langues CONFIGURÉES du lecteur
 * d'abord, dans l'ordre du Prisme (système, régionale, destination personnalisée, locale appareil), puis les langues
 * candidates dans l'ordre fourni (la table « courantes d'abord », qui couvre les 18 langues de la liste d'iOS). Chez
 * iOS la liste est fixe ; ici elle mène avec ce que le lecteur lit déjà, ce qui garde la ligne qu'il cherche en tête
 * sans retirer aucune langue. La langue d'origine n'a jamais de ligne (elle a sa bannière), aucune langue n'est
 * inventée, et un code configuré hors de la table garde sa ligne à son rang.
 */
object LanguageExplorerOrder {

    fun of(
        originalLanguage: String?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        candidates: List<LanguageInfo>,
    ): List<String> {
        val original = originalLanguage.normalizedCode()
        val ordered = LinkedHashSet<String>()
        val ranked = ReaderPrism.resolve(preferences) + candidates.map { it.code }
        for (language in ranked) {
            val code = language.normalizedCode() ?: continue
            if (code != original) ordered.add(code)
        }
        return ordered.toList()
    }

    private fun String?.normalizedCode(): String? = this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
