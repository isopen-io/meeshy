package me.meeshy.sdk.model.composer

/** Famille d'édition d'un objet dans la scène (miroir de `ComposerInlineFamily`). */
sealed class ComposerInlineFamily {
    data object Text : ComposerInlineFamily()
    data object Image : ComposerInlineFamily()
    data object Video : ComposerInlineFamily()
    data object Audio : ComposerInlineFamily()
    data object Sticker : ComposerInlineFamily()
    data object Place : ComposerInlineFamily()
    data class Background(val video: Boolean) : ComposerInlineFamily()

    val sceneKind: ComposerObjectKind
        get() = when (this) {
            Text -> ComposerObjectKind.TEXT
            Image, Video, is Background -> ComposerObjectKind.MEDIA
            Audio -> ComposerObjectKind.AUDIO
            Sticker -> ComposerObjectKind.STICKER
            Place -> ComposerObjectKind.PLACE
        }

    val isVideo: Boolean
        get() = when (this) {
            Video -> true
            is Background -> video
            Text, Image, Audio, Sticker, Place -> false
        }

    val isBackground: Boolean get() = this is Background

    companion object {
        fun of(kind: ComposerObjectKind, isVideo: Boolean, isBackground: Boolean): ComposerInlineFamily =
            when (kind) {
                ComposerObjectKind.TEXT -> Text
                ComposerObjectKind.STICKER -> Sticker
                ComposerObjectKind.PLACE -> Place
                ComposerObjectKind.AUDIO -> Audio
                ComposerObjectKind.MEDIA -> when {
                    isBackground -> Background(isVideo)
                    isVideo -> Video
                    else -> Image
                }
            }
    }
}

/** Édition en cours : au plus UNE section ouverte (`openSection`). */
data class ComposerInlineEdit(
    val objectId: String,
    val family: ComposerInlineFamily,
    val openSection: ComposerObjectEditorSection? = null,
)

object ComposerInlineEditing {

    fun sections(family: ComposerInlineFamily, hasTrimmableSource: Boolean): List<ComposerObjectEditorSection> {
        val served = ComposerObjectEditorRail.entries(
            family = family.sceneKind,
            hasTrimmableSource = hasTrimmableSource,
            offersFilter = !family.isVideo,
            offersAdjust = family.sceneKind == ComposerObjectKind.MEDIA,
        ).filter { section ->
            when (section) {
                ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan -> !family.isBackground
                is ComposerObjectEditorSection.Media -> section.tool in MediaEditTool.served
                is ComposerObjectEditorSection.Tool -> true
            }
        }
        val crop = if (family == ComposerInlineFamily.Image) {
            listOf<ComposerObjectEditorSection>(ComposerObjectEditorSection.Media(MediaEditTool.CROP))
        } else {
            emptyList()
        }
        return crop + served
    }

    fun begin(
        objectId: String,
        family: ComposerInlineFamily,
        onSceneSurface: Boolean,
        requested: ComposerObjectEditorSection?,
        hasTrimmableSource: Boolean,
    ): ComposerInlineEdit? {
        if (!onSceneSurface) return null
        val served = sections(family, hasTrimmableSource)
        return ComposerInlineEdit(objectId, family, requested?.takeIf { it in served })
    }

    /** Toucher la section ouverte la ferme ; toucher une autre remplace : jamais deux ouvertes. */
    fun tapped(section: ComposerObjectEditorSection, edit: ComposerInlineEdit): ComposerInlineEdit =
        edit.copy(openSection = if (edit.openSection == section) null else section)

    fun resolved(
        edit: ComposerInlineEdit?,
        selectedId: String?,
        family: ComposerInlineFamily?,
        served: List<ComposerObjectEditorSection>,
        onSceneSurface: Boolean,
    ): ComposerInlineEdit? {
        if (edit == null || !onSceneSurface || edit.objectId != selectedId || edit.family != family) return null
        val open = edit.openSection ?: return edit
        return if (open in served) edit else edit.copy(openSection = null)
    }
}
