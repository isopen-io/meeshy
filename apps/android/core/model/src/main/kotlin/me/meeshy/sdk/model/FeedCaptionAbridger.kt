package me.meeshy.sdk.model

/**
 * La légende posée PAR-DESSUS l'image dans le fil — miroir de `FeedCaptionOverlay.abridged / isTruncated / full` (iOS).
 *
 * Elle s'abrège en MOTS, jamais en lignes : une troncature en lignes dépend de la largeur, de la police et de la taille de
 * texte, une troncature en mots n'en dépend d'aucune. La règle est celle de [MediaCaptionRule] appelée avec le seuil du fil
 * (vingt mots, tête de vingt) : le dépôt n'a qu'UNE loi pour abréger une légende.
 */
public object FeedCaptionAbridger {
    /** Vingt mots (directive porteur 2026-09-05), distinct du seuil du plein écran. */
    public const val WORD_COUNT: Int = 20

    /** Les [words] premiers mots, suivis d'un « … » SEULEMENT s'il reste quelque chose ; `null` pour une légende vide. */
    public fun abridged(caption: String, words: Int = WORD_COUNT): String? {
        val clean = caption.trim()
        if (clean.isEmpty()) return null
        val folded = MediaCaptionRule.collapse(clean, threshold = words, head = words)
        return if (folded.isTruncated) folded.head + "…" else folded.head
    }

    /** La légende dépasse-t-elle les vingt mots ? Posée à la règle, pas à une comparaison de chaînes. */
    public fun isTruncated(caption: String, words: Int = WORD_COUNT): Boolean {
        val clean = caption.trim()
        if (clean.isEmpty()) return false
        return MediaCaptionRule.collapse(clean, threshold = words, head = words).isTruncated
    }

    /** Le texte entier, débarrassé de ses bords. */
    public fun full(caption: String): String = caption.trim()
}

/**
 * La page tenue d'un carrousel, ramenée dans `0 until count` (0 pour une liste vide) — miroir de
 * `FeedCarouselLayout.page(_:clampedTo:)` (iOS). Un post qui perd un média sous la carte ne laisse pas la page au-delà de la fin.
 */
public object FeedCarouselPaging {
    public fun page(index: Int, count: Int): Int = index.coerceIn(0, maxOf(0, count - 1))
}
