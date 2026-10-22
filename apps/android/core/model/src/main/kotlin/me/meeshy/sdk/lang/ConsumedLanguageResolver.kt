package me.meeshy.sdk.lang

/**
 * Quelle version linguistique un lecteur a RÉELLEMENT sous les yeux.
 *
 * ## Pourquoi ce n'est pas simplement « sa langue préférée »
 *
 * Meeshy affiche le même message dans autant de langues qu'il y a de lecteurs, mais une
 * traduction n'existe pas toujours. Quand elle manque, c'est l'ORIGINAL qui s'affiche :
 * déclarer que le message a été lu dans la langue préférée mentirait précisément là où
 * l'auteur a besoin de savoir — « m'a-t-on lu dans ma langue, ou traduit ? ».
 *
 * ## La règle suit celle du TEXTE
 *
 * Même ordre, même repli, même interdit que la descente du Prisme
 * ([PrismTranslationResolver]) : la langue d'origine concourt à son RANG, jamais de repli
 * sur une traduction tierce. L'absence de traduction dans une langue préférée signifie que
 * le contenu y est déjà, ou qu'aucune traduction n'a été produite ; servir une langue sans
 * rapport serait pire que l'original. Toute divergence entre cette résolution et celle du
 * texte produirait une statistique fausse — d'où le miroir strict.
 *
 * Miroir de `ConsumedLanguageResolver.swift` (`packages/MeeshySDK/.../Models/`). Consommée par
 * les accusés de lecture, qui déclarent la langue lue au serveur (`mark-read`).
 */
object ConsumedLanguageResolver {

    /**
     * @param originalLanguage langue de rédaction du contenu.
     * @param availableTranslations langues pour lesquelles une traduction existe.
     * @param preferredLanguages préférences du lecteur, DANS L'ORDRE — le prisme strict
     *   ([ReaderPrism]), jamais la liste de composition qui porte le repli « fr ».
     * @param manualSelection version explicitement ouverte par le lecteur, qui prime sur ses
     *   préférences — il a vu celle-là.
     * @return le code de la version affichée, `null` s'il est impossible de le déterminer.
     *   Mieux vaut ne rien rapporter qu'inventer une langue.
     */
    fun resolve(
        originalLanguage: String?,
        availableTranslations: List<String>,
        preferredLanguages: List<String>,
        manualSelection: String? = null,
    ): String? {
        val original = LanguageCodeNormalizer.normalize(originalLanguage)
        val translations = availableTranslations.mapNotNullTo(HashSet(), LanguageCodeNormalizer::normalize)

        // Une bascule explicite l'emporte : le lecteur a choisi cette version. Encore faut-il
        // qu'elle existe — un code périmé ne doit pas être pris pour argent comptant.
        LanguageCodeNormalizer.normalize(manualSelection)
            ?.takeIf { it == original || it in translations }
            ?.let { return it }

        for (candidate in preferredLanguages.mapNotNull(LanguageCodeNormalizer::normalize)) {
            // Le contenu est déjà dans cette langue : c'est l'original qui s'affiche, aucune
            // traduction n'entre en jeu.
            if (candidate == original) return original
            if (candidate in translations) return candidate
        }

        // Aucune préférence servie : le lecteur voit l'original. `null` quand même celui-ci
        // est inconnu — rien de fiable à déclarer.
        return original
    }
}

/**
 * La langue DOMINANTE d'un lot et ses exceptions — la forme qu'attend `mark-read` :
 * [language] est la langue lue par la majorité des messages du lot, [exceptions] l'écart
 * `messageId → langue` des autres.
 */
data class DominantSplit(
    val language: String?,
    val exceptions: Map<String, String>,
)

/**
 * Sépare un lot `messageId → langue lue` en sa langue DOMINANTE et ses exceptions. À égalité,
 * le code alphabétiquement premier gagne : deux exécutions sur les mêmes données donnent le
 * même corps de requête. Lot vide : aucune langue, aucune exception. Miroir de
 * `PrismTranslationLaw.dominantSplit` (iOS).
 */
fun dominantSplit(resolved: Map<String, String>): DominantSplit {
    val dominant = resolved.values
        .groupingBy { it }
        .eachCount()
        .entries
        .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
        .firstOrNull()
        ?.key
        ?: return DominantSplit(language = null, exceptions = emptyMap())
    return DominantSplit(
        language = dominant,
        exceptions = resolved.filterValues { it != dominant },
    )
}
