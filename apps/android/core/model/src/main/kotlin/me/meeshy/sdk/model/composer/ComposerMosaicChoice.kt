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

    /**
     * The layouts the format menu unfolds — iOS `ComposerPublishMenuRule.entries`: under Post only (a reel is one clip after
     * another, it has no layout to choose), and only where [isServed]. Empty means no section at all.
     */
    fun offered(slideCount: Int, format: ComposerFormat): List<MosaicLayoutMode> =
        if (format == ComposerFormat.POST && isServed(slideCount, format)) ordered else emptyList()

    /** The entry the menu ticks: the armed layout, or — until the author chooses — the fallback the publication applies. */
    fun checked(armed: MosaicLayoutMode?): MosaicLayoutMode = armed ?: fallback

    /**
     * What the publication writes (`storyEffects.layout`): the armed layout, and only where the control was offered — the
     * same rule the control reads, so a layout the author no longer sees (a media removed, the format changed) never travels.
     */
    fun published(armed: MosaicLayoutMode?, slideCount: Int, format: ComposerFormat): MosaicLayoutMode? =
        armed?.takeIf { it in offered(slideCount, format) }
}
