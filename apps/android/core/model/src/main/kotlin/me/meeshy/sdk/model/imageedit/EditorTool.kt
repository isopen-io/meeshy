package me.meeshy.sdk.model.imageedit

/**
 * Un outil de la grappe flottante de l'éditeur d'image. Miroir d'iOS `EditorTool` : l'ordre
 * de [entries] est celui du rail de FAB et du sélecteur d'outil du panneau.
 */
public enum class EditorTool {
    CROP,
    FILTERS,
    ADJUST,
    EFFECTS;

    /** Outils offerts en mode Simple ; le mode Pro les montre tous. */
    public val isEssential: Boolean
        get() = this != EFFECTS

    public companion object {
        public fun rail(mode: ImageEditorMode): List<EditorTool> =
            if (mode.isPro) entries.toList() else entries.filter { it.isEssential }
    }
}
