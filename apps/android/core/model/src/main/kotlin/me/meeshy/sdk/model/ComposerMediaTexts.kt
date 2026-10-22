package me.meeshy.sdk.model

/** Les deux textes qu'un média de publication porte : [ALT] décrit, [CAPTION] s'affiche. */
enum class PostMediaText {
    ALT,
    CAPTION,
    ;

    companion object {
        /** Borne du TRANSPORT (`z.string().max(1000)` côté gateway), pour les deux colonnes. */
        const val MAX_LENGTH: Int = 1000
    }
}

/**
 * Alt et légende par média, portés ENSEMBLE d'un bout à l'autre de la publication
 * (miroir de `ComposerMediaTexts`, iOS). Clés = ids d'éléments du composer jusqu'à l'upload,
 * puis ids de média serveur.
 */
data class ComposerMediaTexts(
    val alt: Map<String, String> = emptyMap(),
    val caption: Map<String, String> = emptyMap(),
) {
    val isEmpty: Boolean get() = alt.isEmpty() && caption.isEmpty()

    /**
     * Forme du TRANSPORT : texte vide ou blanc écarté, borné à [PostMediaText.MAX_LENGTH],
     * et `null` quand rien ne reste — jamais une map vide (le gateway lit l'absence « n'y
     * touche pas »).
     */
    fun payload(kind: PostMediaText): Map<String, String>? {
        val collected = if (kind == PostMediaText.ALT) alt else caption
        return collected
            .filterValues { it.isNotBlank() }
            .mapValues { it.value.take(PostMediaText.MAX_LENGTH) }
            .takeIf { it.isNotEmpty() }
    }

    companion object {
        val NONE = ComposerMediaTexts()
    }
}
