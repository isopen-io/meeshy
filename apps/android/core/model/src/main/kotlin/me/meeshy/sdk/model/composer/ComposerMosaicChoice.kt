package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MosaicLayoutMode

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
