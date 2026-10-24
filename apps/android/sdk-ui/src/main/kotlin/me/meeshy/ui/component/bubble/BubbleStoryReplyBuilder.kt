package me.meeshy.ui.component.bubble

import me.meeshy.sdk.model.ApiPostReplyTarget
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * The story/mood half of the quotes of [BubbleContentBuilder] (the message half is
 * [BubbleQuotedReplyBuilder]).
 */
internal object BubbleStoryReplyBuilder {

    /**
     * Projects the quoted post/story into a [BubbleStoryReply] — port of the
     * `postReplyTo` / `storyReplyToId` branch of iOS `APIMessage → ReplyReference`.
     * A non-blank `moodEmoji` yields a mood preview (emoji + text); otherwise a
     * story preview (thumbnail + metrics). A bare `storyReplyToId` with no
     * snapshot yields a metadata-less story preview. Returns null when neither
     * a snapshot nor a story id is present.
     */
    fun build(
        target: ApiPostReplyTarget?,
        storyReplyToId: String?,
        mediaBaseUrl: String?,
    ): BubbleStoryReply? {
        if (target != null) {
            val moodEmoji = target.moodEmoji?.trim()?.ifBlank { null }
            if (moodEmoji != null) {
                return BubbleStoryReply(
                    previewText = target.previewText,
                    moodEmoji = moodEmoji,
                )
            }
            return BubbleStoryReply(
                previewText = target.previewText,
                reactionCount = target.reactionCount,
                commentCount = target.commentCount,
                shareCount = target.shareCount,
                thumbnailUrl = target.thumbnailUrl
                    ?.takeIf { it.isNotBlank() }
                    ?.let { resolveMediaUrl(it, mediaBaseUrl) },
            )
        }
        if (!storyReplyToId.isNullOrBlank()) {
            return BubbleStoryReply()
        }
        return null
    }
}
