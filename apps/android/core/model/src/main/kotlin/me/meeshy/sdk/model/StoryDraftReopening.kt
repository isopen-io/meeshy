package me.meeshy.sdk.model

/**
 * « Rouvrir » on a story that did not leave (#13500): the draft kept until confirmation stops
 * awaiting its publication and becomes the composer's own again.
 *
 * Between the publish and the reopening the media still on the device have been uploaded and the
 * publications rewritten to carry the ids they received, while the kept draft still names them by
 * their placeholder. The publications list the slide's media first and in the slide's order
 * (sounds and stickers follow), so a slide takes the prefix of its own publication: the n-th media
 * of the slide is the n-th id of the publication. The alternative texts, captions and backdrop
 * follow their media. A slide the publication cannot account for keeps its ids — nothing is invented.
 */
object StoryDraftReopening {

    /**
     * [publishedMediaIds] is the media list of each queued publication, in the order the slides were
     * queued; a text-only slide queued nothing to carry, so empty lists are skipped.
     */
    fun reopened(kept: StoryComposerDraftSnapshot, publishedMediaIds: List<List<String>>): StoryComposerDraftSnapshot {
        val carriers = publishedMediaIds.filter { it.isNotEmpty() }
        val withMedia = kept.slides.filter { it.mediaIds.isNotEmpty() }
        val renames: Map<String, String> = withMedia.zip(carriers)
            .filter { (slide, carried) -> carried.size >= slide.mediaIds.size }
            .flatMap { (slide, carried) -> slide.mediaIds.zip(carried) }
            .filter { (placeholder, served) -> placeholder != served }
            .toMap()
        fun String.served(): String = renames[this] ?: this
        return kept.copy(
            slides = kept.slides.map { slide ->
                slide.copy(
                    mediaIds = slide.mediaIds.map { it.served() },
                    backgroundMediaId = slide.backgroundMediaId?.served(),
                )
            },
            annotations = kept.annotations.copy(
                mediaAlt = kept.annotations.mediaAlt.mapKeys { (id, _) -> id.served() },
                mediaCaption = kept.annotations.mediaCaption.mapKeys { (id, _) -> id.served() },
            ),
            awaitingPublication = emptyList(),
        )
    }
}
