package me.meeshy.sdk.model.reading.focal

/**
 * La règle de présentation de la citation de la rangée plate — miroir de
 * `QuotedReplyPresentation` (iOS, peau `.focal`) et de ce que `FocalQuotedReplyView` décide :
 * budget de lignes, forme du titre, qui nomme la citation, de quelle couleur est son filet.
 * Kotlin pur : l'écran n'est qu'une projection.
 */
public object FocalQuotedReplyPresentation {
    /** Le titre est une identité : toujours une ligne. */
    public const val TITLE_LINE_LIMIT: Int = 1

    /** L'aperçu de la rangée plate tient sur deux lignes, jamais une (qui coupait à mi-phrase). */
    public const val PREVIEW_LINE_LIMIT: Int = 2

    /** L'écart entre le filet et le contenu cité, en points. */
    public const val RAIL_SPACING: Double = 8.0

    private const val NBSP_COLON: String = " :"

    /** « Alice : » avec l'espace insécable devant le deux-points ; un nom vide ne laisse rien. */
    public fun title(author: String): String = if (author.isEmpty()) "" else author + NBSP_COLON

    /** Qui nomme la citation : soi (« Vous »), une humeur sans auteur (« Humeur »), un nom, ou personne. */
    public sealed interface Author {
        public data object You : Author
        public data object Mood : Author
        public data class Named(val name: String) : Author
        public data object Anonymous : Author
    }

    public fun author(isMe: Boolean, name: String?, isMood: Boolean): Author {
        if (isMe) return Author.You
        val served = name?.takeIf { it.isNotBlank() }
        if (served != null) return Author.Named(served)
        return if (isMood) Author.Mood else Author.Anonymous
    }

    /** Le filet porte l'accent de la conversation pour une citation de MOI, la couleur de l'auteur sinon. */
    public fun railIsAccent(isMe: Boolean): Boolean = isMe

    /** Un aperçu vide se lit comme le libellé court du média cité (« Médias » en repli). */
    public fun previewOrFallback(preview: String, fallback: String): String =
        if (preview.isBlank()) fallback else preview
}
