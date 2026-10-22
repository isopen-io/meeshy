package me.meeshy.sdk.model.composer

/** Familles d'objets de scène (miroir de `MeeshySceneObject.Kind` iOS). */
enum class ComposerObjectKind { TEXT, MEDIA, STICKER, AUDIO, PLACE }

/** Outils d'un texte (miroir de `TextEditTool`, ordre de `TextEditTool.all`). */
enum class TextEditTool(val raw: String) {
    STYLE("style"), EFFECT("effect"), COLOR("color"), ALIGN("align"),
    BACKGROUND("background"), FRAME("frame"), BORDER("border"), LANGUAGE("language");

    companion object {
        val all: List<TextEditTool> = listOf(STYLE, EFFECT, COLOR, ALIGN, BACKGROUND, FRAME, BORDER, LANGUAGE)
    }
}

/** Outils d'un média (miroir de `MediaEditTool`). */
enum class MediaEditTool(val raw: String) {
    TRIM("trim"), ACTIONS("actions"), CROP("crop"), SPLIT("split"),
    FILTER("filter"), ADJUST("adjust"), EFFECTS("effects"), ALT_TEXT("altText");

    companion object {
        val served: List<MediaEditTool> = listOf(FILTER, ADJUST, EFFECTS, TRIM, ACTIONS, ALT_TEXT)
    }
}

/** Une section de l'éditeur d'objet. Une seule est ouverte à la fois. */
sealed class ComposerObjectEditorSection {
    abstract val identifier: String

    data class Tool(val tool: TextEditTool) : ComposerObjectEditorSection() {
        override val identifier: String get() = "tool.${tool.raw}"
    }

    data class Media(val tool: MediaEditTool) : ComposerObjectEditorSection() {
        override val identifier: String get() = "media.${tool.raw}"
    }

    data object Timing : ComposerObjectEditorSection() {
        override val identifier: String get() = "timing"
    }

    data object Plan : ComposerObjectEditorSection() {
        override val identifier: String get() = "plan"
    }
}

/** Sections servies par famille (miroir de `ComposerObjectEditorRail`). */
object ComposerObjectEditorRail {

    val initiallySelected: ComposerObjectEditorSection = ComposerObjectEditorSection.Tool(TextEditTool.STYLE)

    fun entries(
        family: ComposerObjectKind,
        hasTrimmableSource: Boolean = true,
        offersFilter: Boolean = true,
        offersAdjust: Boolean = true,
    ): List<ComposerObjectEditorSection> = entriesOfFamily(family).filter {
        (hasTrimmableSource || it != ComposerObjectEditorSection.Media(MediaEditTool.TRIM)) &&
            (offersFilter || it != ComposerObjectEditorSection.Media(MediaEditTool.FILTER)) &&
            (offersAdjust || it != ComposerObjectEditorSection.Media(MediaEditTool.ADJUST)) &&
            ((offersFilter && offersAdjust) || it != ComposerObjectEditorSection.Media(MediaEditTool.EFFECTS))
    }

    private fun entriesOfFamily(family: ComposerObjectKind): List<ComposerObjectEditorSection> {
        val tools: List<ComposerObjectEditorSection> = when (family) {
            ComposerObjectKind.TEXT -> TextEditTool.all.map { ComposerObjectEditorSection.Tool(it) }
            ComposerObjectKind.MEDIA -> MediaEditTool.served.map { ComposerObjectEditorSection.Media(it) }
            ComposerObjectKind.AUDIO -> listOf(ComposerObjectEditorSection.Media(MediaEditTool.TRIM))
            ComposerObjectKind.STICKER, ComposerObjectKind.PLACE -> emptyList()
        }
        return tools + ComposerObjectEditorSection.Timing + ComposerObjectEditorSection.Plan
    }

    /** Garde la sélection si elle est servie, sinon la première entrée de la famille. */
    fun selection(
        family: ComposerObjectKind,
        keeping: ComposerObjectEditorSection,
        hasTrimmableSource: Boolean = true,
        offersFilter: Boolean = true,
        offersAdjust: Boolean = true,
    ): ComposerObjectEditorSection {
        val served = entries(family, hasTrimmableSource, offersFilter, offersAdjust)
        val first = served.firstOrNull() ?: return keeping
        return if (served.contains(keeping)) keeping else first
    }

    fun ownsTextField(section: ComposerObjectEditorSection): Boolean =
        section == ComposerObjectEditorSection.Media(MediaEditTool.ALT_TEXT)
}
