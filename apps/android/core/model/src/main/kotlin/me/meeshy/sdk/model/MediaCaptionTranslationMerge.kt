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
 * Port of the iOS `FeedViewModel.applyMediaCaptionTranslation(_:mediaId:commentId:language:to:)`,
 * scoped to POST-level media only: unlike iOS's `FeedPost`, Android's [ApiPostComment]
 * carries no `media` list yet, so a translation targeting a comment's media
 * ([commentId] non-null) is a documented no-op here until comment media lands on
 * Android — see `tasks/lessons.md` before assuming parity on this point.
 */
object MediaCaptionTranslationMerge {

    /**
     * Merge [entry] into the media identified by [mediaId] on [post], or return `null`
     * when it is a no-op (nothing to persist):
     *  - [commentId] is non-null (comment-level media isn't modeled on Android yet);
     *  - no media on [post] matches [mediaId];
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
        if (commentId != null) return null
        val lang = language.trim()
        if (lang.isEmpty()) return null
        if (entry.text.isBlank()) return null

        val media = post.media.orEmpty()
        val mediaIndex = media.indexOfFirst { it.id == mediaId }
        if (mediaIndex < 0) return null
        val target = media[mediaIndex]

        val existing = target.captionTranslations.orEmpty()
        val matchKey = existing.keys.firstOrNull { it.equals(lang, ignoreCase = true) }
        if (matchKey != null && existing[matchKey] == entry) return null

        val merged = if (matchKey != null) {
            existing.mapValues { (key, value) -> if (key == matchKey) entry else value }
        } else {
            existing + (lang to entry)
        }
        val updatedMedia = media.mapIndexed { index, item ->
            if (index == mediaIndex) item.copy(captionTranslations = merged) else item
        }
        return post.copy(media = updatedMedia)
    }
}
