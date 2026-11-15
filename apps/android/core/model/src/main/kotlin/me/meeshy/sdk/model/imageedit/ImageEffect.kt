package me.meeshy.sdk.model.imageedit

/** Effet créatif d'un geste appliqué en dernier étage du rendu. Miroir d'iOS `ImageEffect`. */
public enum class ImageEffect(public val wireName: String) {
    NONE("none"),
    BLUR("blur"),
    VIGNETTE("vignette"),
    SHARPEN("sharpen"),
    BLOOM("bloom"),
    GRAIN("grain");

    public companion object {
        public fun fromWireName(name: String?): ImageEffect =
            entries.firstOrNull { it.wireName == name } ?: NONE
    }
}
