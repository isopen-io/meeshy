package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MentionCandidate

/**
 * Builds the composer @-mention roster for a post's comment thread. This is product
 * orchestration (it belongs in `:feature:feed`, not the SDK): it encodes the Meeshy rule
 * for *who* a new comment can @-mention — the participants already talking in the thread —
 * the feed analogue of [MentionRoster.fromParticipants] for chat, and of iOS feeding the
 * comment composer's roster from the thread's authors.
 *
 * The candidates feed the shared, stateless [me.meeshy.sdk.mention.MentionComposer] SSOT
 * (filter/insert/merge) exactly as the chat composer's participant roster does, so the two
 * surfaces share one autocomplete behaviour. Filtering mirrors chat:
 *  - a blank handle is dropped (a mention can never address it),
 *  - the current user is excluded (you don't @-mention yourself),
 *  - the display name degrades to the handle when absent or blank,
 *  - a handle repeated across comments is deduped case-insensitively, the first author winning,
 *  - encounter order is preserved (the thread's reading order).
 */
object CommentMentionRoster {

    fun build(comments: List<ApiPostComment>, excludeUserId: String?): List<MentionCandidate> {
        val seen = mutableSetOf<String>()
        return comments.mapNotNull { comment ->
            val author = comment.author ?: return@mapNotNull null
            val handle = author.username?.trim().orEmpty()
            if (handle.isEmpty()) return@mapNotNull null
            if (author.id == excludeUserId) return@mapNotNull null
            if (!seen.add(handle.lowercase())) return@mapNotNull null
            MentionCandidate(
                id = author.id,
                username = handle,
                displayName = author.displayName?.trim()?.ifEmpty { null } ?: handle,
                avatarURL = author.avatar,
            )
        }
    }
}
