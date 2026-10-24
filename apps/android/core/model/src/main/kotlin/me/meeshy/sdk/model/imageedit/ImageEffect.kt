package me.meeshy.sdk.model.imageedit

/** Effet créatif d'un geste appliqué en dernier étage du rendu. Miroir d'iOS `ImageEffect`. */
public enum class ImageEffect(public val wireName: String) {
    NONE("none"),
    BLUR("blur"),
    VIGNETTE("vignette"),
    SHARPEN("sharpen"),
    BLOOM("bloom"),
    GRAIN("grain");

    /** Effets offerts en mode Simple : seul « aucun » ; le mode Pro les montre tous. */
    public val isEssential: Boolean
        get() = this == NONE

    public companion object {
        public fun rail(mode: ImageEditorMode): List<ImageEffect> =
            if (mode.isPro) entries.toList() else entries.filter { it.isEssential }

        public fun fromWireName(name: String?): ImageEffect =
            entries.firstOrNull { it.wireName == name } ?: NONE
    }
}
