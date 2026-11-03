package me.meeshy.sdk.model

/**
 * Le panneau SECONDAIRE d'une bulle (iOS `BubbleSecondaryContent`) : la traduction d'une autre langue lue sous le texte
 * principal, avec le drapeau et le nom de sa langue et son trait-point-trait à sa couleur.
 */
data class BubbleSecondaryPanel(
    val code: String,
    val text: String,
    val flag: String?,
    val name: String?,
    /** Couleur de la langue, hexadécimale sans `#` ; nulle quand la langue est inconnue (le panneau prend l'encre). */
    val colorHex: String?,
) {
    companion object {
        /** Opacité des deux traits du séparateur (iOS `langColor.opacity(0.4)`). */
        const val SEPARATOR_LINE_ALPHA: Float = 0.4f

        /**
         * Le panneau ouvert, ou null : rien d'ouvert, aucun texte pour cette langue, ou la langue est déjà celle du
         * texte principal (il ne se répète pas).
         */
        fun of(openCode: String?, activeCode: String?, texts: Map<String, String>): BubbleSecondaryPanel? {
            val code = openCode?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
            if (code == activeCode?.trim()?.lowercase()) return null
            val text = texts.entries.firstOrNull { it.key.trim().lowercase() == code }?.value
                ?.takeIf { it.isNotBlank() } ?: return null
            val info = LanguageData.info(code)
            return BubbleSecondaryPanel(code, text, info?.flag, info?.name, info?.colorHex)
        }
    }
}
