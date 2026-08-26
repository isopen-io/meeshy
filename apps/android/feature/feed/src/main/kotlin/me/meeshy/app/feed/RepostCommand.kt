package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiRepostOf

/**
 * The concrete network payload a repost/quote-repost action must send — pure SSOT
 * over two decisions iOS scatters across `FeedViewModel.repostPost` /
 * `resolveRepostTargetId` (`FeedViewModel.swift`):
 *
 *  1. **Which id to repost.** Re-sharing a SHARE must reference the ORIGINAL
 *     reel/post (its root), never the intermediate share — the gateway hydrates
 *     `repostOf` only one level deep, so reposting a repost by its own id embeds
 *     an EMPTY share card. When the tapped post is itself a repost, the target is
 *     its recorded root (`originalRepostOfId`, else the directly-reposted id); a
 *     non-repost reposts with its own id. (Port of iOS `resolveRepostTargetId`.)
 *
 *  2. **Whether it is a quote, and what commentary rides along.** A simple repost
 *     never carries content (`content = null`, `isQuote = false`). A quote carries
 *     the author's commentary and flags `isQuote` — but only when there is actual
 *     commentary: iOS sends `isQuote: isQuote ? (content != nil) : false`. Android
 *     goes one better than iOS's raw `content != nil` — a blank/whitespace-only
 *     commentary degrades the quote to a simple repost, so an empty quote card is
 *     never created (iOS would send `content = ""`, `isQuote = true`).
 */
data class RepostCommand(
    val targetId: String,
    val content: String?,
    val isQuote: Boolean,
) {
    companion object {
        /**
         * Build the command for reposting [postId].
         *
         * @param repostOf the tapped post's embedded repost, when the post is itself
         *   a repost — used to resolve the root target id. `null` for an original post.
         * @param quote the user chose "quote" (commentary) rather than a plain repost.
         * @param commentary the quote commentary the user typed (ignored unless [quote]).
         */
        fun of(
            postId: String,
            repostOf: ApiRepostOf?,
            quote: Boolean,
            commentary: String?,
        ): RepostCommand {
            val content = commentary?.trim()?.takeIf { quote && it.isNotEmpty() }
            return RepostCommand(
                targetId = resolveTargetId(postId, repostOf),
                content = content,
                isQuote = content != null,
            )
        }

        private fun resolveTargetId(postId: String, repostOf: ApiRepostOf?): String {
            if (repostOf == null) return postId
            val root = repostOf.originalRepostOfId?.trim()?.takeIf { it.isNotEmpty() }
            return root ?: repostOf.id
        }
    }
}
