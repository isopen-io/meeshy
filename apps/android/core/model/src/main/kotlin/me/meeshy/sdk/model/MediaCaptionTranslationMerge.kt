package me.meeshy.sdk.model

/**
 * Prisme Linguistique — realtime merge of a media caption translation (#6280).
 *
 * Push-side sibling of [PostTranslationMerge] (which merges `Post.content`) and the
 * caption-shaped analog of [StoryTextObjectTranslationMerge] (which merges a story's
 * on-canvas overlay text). The gateway broadcasts `media:caption-translation-updated`
 * (`{ mediaId, postId, commentId?, language, translation }`) once it has translated a
 * `PostMedia.caption`; this upserts that translation into the matched media's
 * [ApiPostMedia.captionTranslations] map so an open feed card re-renders in the
 * reader's preferred language the instant it lands — no refetch.
 *
 * Port of the iOS `FeedViewModel.applyMediaCaptionTranslation(_:mediaId:commentId:language:to:)`:
 * the media belongs to the post itself, or — when [commentId] names one of the post's
 * comments — to that comment ([ApiPostComment.media]).
 */
object MediaCaptionTranslationMerge {

    /**
     * Merge [entry] into the media identified by [mediaId] on [post] (or on its comment
     * [commentId]), or return `null` when it is a no-op (nothing to persist):
     *  - [commentId] names a comment the post does not carry, or one without that media;
     *  - no media matches [mediaId];
     *  - a blank [language] or a blank [entry] text — the Prisme never stores an
     *    empty translation;
     *  - an identical entry already present under that language (matched
     *    case-insensitively) — a metadata-only change is NOT a no-op.
     */
    fun merge(
        post: ApiPost,
        mediaId: String,
        commentId: String?,
        language: String,
        entry: ApiMediaCaptionTranslationEntry,
    ): ApiPost? {
        val lang = language.trim()
        if (lang.isEmpty() || entry.text.isBlank()) return null
        if (commentId == null) {
            val media = mergeIntoMedia(post.media, mediaId, lang, entry) ?: return null
            return post.copy(media = media)
        }
        val comments = post.comments.orEmpty()
        val commentIndex = comments.indexOfFirst { it.id == commentId }
        if (commentIndex < 0) return null
        val media = mergeIntoMedia(comments[commentIndex].media, mediaId, lang, entry) ?: return null
        return post.copy(
            comments = comments.mapIndexed { index, item -> if (index == commentIndex) item.copy(media = media) else item },
        )
    }

    private fun mergeIntoMedia(
        media: List<ApiPostMedia>?,
        mediaId: String,
        lang: String,
        entry: ApiMediaCaptionTranslationEntry,
    ): List<ApiPostMedia>? {
        val all = media.orEmpty()
        val mediaIndex = all.indexOfFirst { it.id == mediaId }
        if (mediaIndex < 0) return null
        val existing = all[mediaIndex].captionTranslations.orEmpty()
        val matchKey = existing.keys.firstOrNull { it.equals(lang, ignoreCase = true) }
        if (matchKey != null && existing[matchKey] == entry) return null
        val merged = if (matchKey != null) {
            existing.mapValues { (key, value) -> if (key == matchKey) entry else value }
        } else {
            existing + (lang to entry)
        }
        return all.mapIndexed { index, item -> if (index == mediaIndex) item.copy(captionTranslations = merged) else item }
    }
}
