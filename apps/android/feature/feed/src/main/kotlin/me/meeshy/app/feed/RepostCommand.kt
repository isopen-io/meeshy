package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.postTypeFromWire

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
 *
 *  3. **Which format the repost takes.** The format is the CARD's, never the root's (iOS
 *     `RepostTargeting.target(cardType:)`): a reel reposted from the reels viewer stays a reel, a
 *     feed card stays a post. An unknown or missing type leaves [targetType] `null`, the gateway's
 *     fallback — a safety net, never the intent.
 */
data class RepostCommand(
    val targetId: String,
    val content: String?,
    val isQuote: Boolean,
    val targetType: PostType? = null,
) {
    companion object {
        /**
         * Build the command for reposting [postId].
         *
         * @param repostOf the tapped post's embedded repost, when the post is itself
         *   a repost — used to resolve the root target id. `null` for an original post.
         * @param quote the user chose "quote" (commentary) rather than a plain repost.
         * @param commentary the quote commentary the user typed (ignored unless [quote]).
         * @param cardType the served type of the card the user acted on — the format of the repost.
         */
        fun of(
            postId: String,
            repostOf: ApiRepostOf?,
            quote: Boolean,
            commentary: String?,
            cardType: String? = null,
        ): RepostCommand {
            val content = commentary?.trim()?.takeIf { quote && it.isNotEmpty() }
            return RepostCommand(
                targetId = resolveTargetId(postId, repostOf),
                content = content,
                isQuote = content != null,
                targetType = postTypeFromWire(cardType),
            )
        }

        private fun resolveTargetId(postId: String, repostOf: ApiRepostOf?): String {
            if (repostOf == null) return postId
            val root = repostOf.originalRepostOfId?.trim()?.takeIf { it.isNotEmpty() }
            return root ?: repostOf.id
        }
    }
}
