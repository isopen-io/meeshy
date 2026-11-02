package me.meeshy.sdk.model.composer

/**
 * What the text of a slide MEANS, by profile — port of iOS `ComposerSlideTextRole`
 * (`docs/product/meeshy-composer-modele.md` § 3). A slide IS a whole story/reel, but only ONE
 * media of a post: so the text is the publication's content, or that media's caption.
 */
enum class ComposerSlideTextRole {
    CONTENT, CAPTION;

    /** A caption needs a media to belong to; a content does not. */
    val needsMediaTarget: Boolean get() = this == CAPTION

    companion object {
        fun of(format: ComposerFormat): ComposerSlideTextRole = when (format) {
            ComposerFormat.STORY, ComposerFormat.REEL, ComposerFormat.STATUS -> CONTENT
            ComposerFormat.POST -> CAPTION
        }

        /** Where the description field writes once the role AND the media are known. */
        fun descriptionTarget(format: ComposerFormat, media: String?): DescriptionTarget = when (of(format)) {
            CONTENT -> DescriptionTarget.SlideContent
            CAPTION -> media?.let { DescriptionTarget.MediaCaption(it) } ?: DescriptionTarget.PostContent
        }
    }
}

sealed interface DescriptionTarget {
    /** Story, reel, mood: the slide text IS the publication's content. */
    data object SlideContent : DescriptionTarget

    /** Post with a media on the slide: the text is ITS caption. */
    data class MediaCaption(val media: String) : DescriptionTarget

    /** Post whose slide carries no media: the field describes the publication. */
    data object PostContent : DescriptionTarget
}
