package me.meeshy.sdk.model.imageedit

/**
 * Où va l'image éditée : le contexte choisit le ratio de recadrage proposé d'emblée.
 * Miroir d'iOS `MediaPreviewContext.preferredCropRatio`.
 */
public enum class ImageEditorContext(public val preferredCropRatio: CropRatio?) {
    STORY(CropRatio.RATIO_9_16),
    POST(null),
    MESSAGE(null),
    AVATAR(CropRatio.SQUARE),
    BANNER(CropRatio.RATIO_16_9),
    COMMUNITY(null);

    /** Le ratio initial du recadrage : celui du contexte, ou libre. */
    public val initialCropRatio: CropRatio
        get() = preferredCropRatio ?: CropRatio.FREE
}
