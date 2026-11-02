package me.meeshy.sdk.model.imageedit

/** Préréglage de look appliqué en premier étage du rendu. Miroir d'iOS `ImageFilter`. */
public enum class ImageFilter(public val wireName: String) {
    ORIGINAL("original"),
    VIVID("vivid"),
    DRAMATIC("dramatic"),
    MONO("mono"),
    NOIR("noir"),
    SEPIA("sepia"),
    WARM("warm"),
    COOL("cool"),
    FADE("fade"),
    CHROME("chrome"),
    PROCESS("process"),
    INSTANT("instant");

    /** Filtres offerts en mode Simple ; le mode Pro les montre tous. */
    public val isEssential: Boolean
        get() = this in ESSENTIALS

    public companion object {
        private val ESSENTIALS = setOf(ORIGINAL, VIVID, DRAMATIC, MONO, WARM, COOL)

        public fun rail(mode: ImageEditorMode): List<ImageFilter> =
            if (mode.isPro) entries.toList() else entries.filter { it.isEssential }

        public fun fromWireName(name: String?): ImageFilter =
            entries.firstOrNull { it.wireName == name } ?: ORIGINAL
    }
}
