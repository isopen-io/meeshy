package me.meeshy.app.feed

import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerHeaderTiles
import me.meeshy.sdk.model.composer.ComposerSlideTextRole
import me.meeshy.sdk.model.composer.DescriptionTarget

/**
 * The slides of a post on the plateau. In a post a slide IS a media (iOS `MeeshyComposerHost+Intake`: « en Post, une
 * slide est UN média »), so the rail has one tile per attached media and the text of the current slide is the caption of
 * ITS media (`ComposerSlideTextRole.caption`). Pure: the rail and the caption field are glue over these answers.
 */
internal object PostSlideLaw {
    /** The slide being edited: the selected media if it is still attached, else the first. */
    fun current(ids: List<String>, selected: String?): String? = selected?.takeIf { it in ids } ?: ids.firstOrNull()

    /** Who is current once [removed] has left [ids]: the slide that takes its place (or the one before the last), none if it was alone. */
    fun selectionAfterRemoval(ids: List<String>, removed: String, current: String?): String? {
        if (removed != current) return current
        val index = ids.indexOf(removed)
        val remaining = ids - removed
        return remaining.getOrNull(index) ?: remaining.lastOrNull()
    }

    /** The rail stands as soon as a media exists — it is the post's scene (iOS `ComposerHeaderTiles.showsRail`). */
    fun showsRail(count: Int): Boolean = ComposerHeaderTiles.showsRail(count, scenePresent = count > 0)

    fun tilesNavigate(count: Int): Boolean = ComposerHeaderTiles.tilesNavigate(count)

    /**
     * The bin belongs to the CURRENT tile. Unlike iOS — where the last scene is removed from the scene's object menu — a
     * post has no scene to host that menu, so a lone media keeps its bin: it is the only way to take it off.
     */
    fun showsDelete(index: Int, currentIndex: Int, count: Int): Boolean = count > 0 && index == currentIndex

    fun captionTarget(format: ComposerFormat, media: String?): DescriptionTarget = ComposerSlideTextRole.descriptionTarget(format, media)

    /** The media whose caption the field writes, or `null` when the slide text is something else (a reel's content, a post without media). */
    fun captionMedia(format: ComposerFormat, media: String?): String? =
        (captionTarget(format, media) as? DescriptionTarget.MediaCaption)?.media
}
