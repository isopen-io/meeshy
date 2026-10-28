package me.meeshy.sdk.model.composer

/** Which publisher a format leaves by — port of iOS `ComposerPublishChannel`: a story is one post per scene, the rest one document. */
enum class ComposerPublishChannel {
    SCENE, DOCUMENT;

    companion object {
        fun of(format: ComposerFormat): ComposerPublishChannel = when (format) {
            ComposerFormat.STORY -> SCENE
            ComposerFormat.POST, ComposerFormat.REEL, ComposerFormat.STATUS -> DOCUMENT
        }
    }
}

/** How a document lays its scenes out for the reader — the five layouts of iOS `MosaicLayoutMode`; [wire] is the canvas string. */
enum class MosaicLayoutMode(val wire: String) {
    CAROUSEL("carousel"), REEL("reel"), HERO("hero"), WAVE("wave"), SINE("sine");

    companion object {
        /** The layout served when the author chose none: one scene per page assumes nothing about the visuals' count. */
        val FALLBACK: MosaicLayoutMode = CAROUSEL

        fun fromWire(raw: String?): MosaicLayoutMode = entries.firstOrNull { it.wire == raw } ?: FALLBACK
    }
}

/** The author's choice of layout — port of iOS `ComposerMosaicChoice`: offered exactly where it has an EFFECT. */
object ComposerMosaicChoice {
    /** Several scenes, and a channel that publishes a document: the layout travels there and nowhere else. */
    fun isServed(slideCount: Int, format: ComposerFormat): Boolean =
        slideCount > 1 && ComposerPublishChannel.of(format) == ComposerPublishChannel.DOCUMENT

    /** The fallback first (what you get without choosing); then one scene at a time; then all of them at once. */
    val ordered: List<MosaicLayoutMode> = listOf(
        MosaicLayoutMode.CAROUSEL, MosaicLayoutMode.REEL, MosaicLayoutMode.HERO, MosaicLayoutMode.WAVE, MosaicLayoutMode.SINE,
    )

    val fallback: MosaicLayoutMode get() = MosaicLayoutMode.FALLBACK
}
