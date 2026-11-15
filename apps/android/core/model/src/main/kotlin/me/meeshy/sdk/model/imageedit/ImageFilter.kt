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

    public companion object {
        public fun fromWireName(name: String?): ImageFilter =
            entries.firstOrNull { it.wireName == name } ?: ORIGINAL
    }
}
