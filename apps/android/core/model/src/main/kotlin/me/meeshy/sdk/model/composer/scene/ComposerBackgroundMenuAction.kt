package me.meeshy.sdk.model.composer.scene

/**
 * Ce qu'un appui long sur un FOND image ou vidéo propose (miroir de `ComposerBackgroundMenuAction` iOS, #5041).
 * L'ordre est celui de la fréquence d'usage ; la destruction vient en dernier, là où le pouce ne la trouve pas
 * par accident.
 */
public enum class ComposerBackgroundMenuAction(public val isDestructive: Boolean = false) {
    EDIT,
    RETAKE_PHOTO,
    BRING_FORWARD,
    DELETE(isDestructive = true),
    ;

    public companion object {
        /** Sans photo possible (un réel), « reprendre une photo » serait un geste sans effet. */
        public fun served(offersPhoto: Boolean): List<ComposerBackgroundMenuAction> =
            entries.filter { offersPhoto || it != RETAKE_PHOTO }
    }
}
