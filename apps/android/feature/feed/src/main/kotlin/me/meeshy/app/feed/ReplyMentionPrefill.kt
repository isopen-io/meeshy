package me.meeshy.app.feed

/**
 * The composer's `@username ` auto-prefill when [PostCommentsViewModel.beginReply] targets a
 * reply row — port of iOS `FeedCommentsSheet.beginReply(to:)`. Flat 2-level threading reparents a
 * reply-to-a-reply to the root, so without this the mention is the only way the addressed person
 * (rather than the thread's root author) is notified/highlighted.
 */
object ReplyMentionPrefill {

    data class Result(val text: String, val prefilledMention: String?)

    /**
     * [replyToParentId] is the *targeted* comment's own `parentId` — non-blank only when the
     * viewer tapped Reply on a reply (not a top-level comment). A previously injected
     * [previousMention] is stripped only when [currentText] still starts with it exactly (an
     * edited/removed prefix is left alone, mirroring iOS's `hasPrefix` guard); re-targeting the
     * same author is idempotent (no double prefix).
     */
    fun apply(
        currentText: String,
        previousMention: String?,
        replyToParentId: String?,
        authorUsername: String?,
    ): Result {
        val stripped = if (previousMention != null && currentText.startsWith(previousMention)) {
            currentText.removePrefix(previousMention)
        } else {
            currentText
        }
        val username = authorUsername?.takeIf { it.isNotBlank() }
        if (replyToParentId.isNullOrBlank() || username == null) {
            return Result(stripped, null)
        }
        val mention = "@$username "
        val newText = if (stripped.startsWith(mention)) stripped else mention + stripped
        return Result(newText, mention)
    }
}
