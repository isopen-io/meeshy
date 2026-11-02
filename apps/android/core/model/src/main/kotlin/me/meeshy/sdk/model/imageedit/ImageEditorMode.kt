package me.meeshy.sdk.model.imageedit

/** Densité de l'éditeur d'image : Simple (essentiel) ou Pro (tout l'outillage). */
public enum class ImageEditorMode {
    SIMPLE,
    PRO;

    public val toggled: ImageEditorMode
        get() = if (this == SIMPLE) PRO else SIMPLE

    public val isPro: Boolean
        get() = this == PRO
}
