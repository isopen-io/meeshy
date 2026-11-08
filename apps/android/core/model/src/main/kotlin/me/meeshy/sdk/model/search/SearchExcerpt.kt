package me.meeshy.sdk.model.search

/** Le média dont une transcription a répondu (#16958) ; un genre inconnu se lit comme un document. */
public enum class SearchMediaKind {
    AUDIO,
    VIDEO,
    IMAGE,
    DOCUMENT,
    ;

    public companion object {
        public fun of(raw: String?): SearchMediaKind =
            entries.firstOrNull { it.name.equals(raw?.trim(), ignoreCase = true) } ?: DOCUMENT
    }
}

/** Ce qui a répondu à la recherche ; une valeur inconnue se lit comme le contenu. */
public enum class SearchMatch {
    CONTENT,
    TRANSCRIPT,
    ;

    public companion object {
        public fun of(raw: String?): SearchMatch = if (raw?.trim().equals("transcript", ignoreCase = true)) TRANSCRIPT else CONTENT
    }
}

/**
 * L'extrait que peint la ligne d'un message trouvé. Un extrait flouté (#16957) est [Veiled] : il ne
 * porte AUCUN texte, la ligne n'a donc rien de lisible à dessiner ni à faire lire. [media] désigne
 * le média dont la transcription a répondu (#16958), peint en icône non actionnable.
 */
public sealed interface SearchExcerpt {
    public val media: SearchMediaKind?

    public data class Shown(val text: String, override val media: SearchMediaKind?) : SearchExcerpt

    public data class Veiled(override val media: SearchMediaKind?) : SearchExcerpt

    /** Ce que lit le lecteur d'écran : le libellé du voile, jamais le texte voilé. */
    public fun spoken(veiledLabel: String, mediaLabel: (SearchMediaKind) -> String): String = when (this) {
        is Veiled -> veiledLabel
        is Shown -> listOfNotNull(media?.let(mediaLabel), text).joinToString(", ")
    }

    public companion object {
        public fun of(text: String, veiled: Boolean, media: SearchMediaKind?): SearchExcerpt =
            if (veiled) Veiled(media) else Shown(text, media)
    }
}
