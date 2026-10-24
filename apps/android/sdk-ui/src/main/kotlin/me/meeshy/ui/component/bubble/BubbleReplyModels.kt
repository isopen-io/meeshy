package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable

/** The kind of media a quoted-reply target carries, for previewing a media-only reply. */
@Immutable
public enum class ReplyMediaKind { None, Image, File }

/**
 * Frozen preview of the post/story a message replies to — port of the
 * story/mood branch of iOS `BubbleQuotedReply`. A non-null [moodEmoji] means the
 * quoted target is a mood/status (emoji + preview text render); otherwise it is
 * a story reply (thumbnail + reaction/comment/share metrics).
 */
@Immutable
public data class BubbleStoryReply(
    val previewText: String = "",
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
    val shareCount: Int = 0,
    val thumbnailUrl: String? = null,
    val moodEmoji: String? = null,
) {
    /** True when the quoted target is a mood/status rather than a story. */
    val isMood: Boolean get() = moodEmoji != null

    /** True when at least one engagement metric is worth surfacing. */
    val hasMetrics: Boolean get() = reactionCount > 0 || commentCount > 0 || shareCount > 0
}
