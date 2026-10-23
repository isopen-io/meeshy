package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent

/** Who the quoted message is from, as the reply banner names them. */
internal sealed interface ReplyBannerAuthor {
    data object Me : ReplyBannerAuthor
    data class Named(val name: String) : ReplyBannerAuthor
    data object Unknown : ReplyBannerAuthor
}

/** What the quoted message is, when its text alone does not say it. */
internal enum class ReplyBannerKind { Text, Photo, Video, Voice, File, Location, Unloaded }

/** The reply banner above the composer: author, preview (never for a protected message) and kind. */
internal data class ComposerReplyBanner(
    val author: ReplyBannerAuthor,
    val preview: String?,
    val kind: ReplyBannerKind,
) {
    companion object {
        /**
         * Projects the quoted [bubble] — `null` when it is not in the loaded window (a reply
         * restored from a draft): the banner still shows, so the reply can be seen and
         * cancelled (iOS keeps an autonomous `ReplyReference`). Port of iOS
         * `composerReplyTitle` / `composerReplyBannerBody`.
         */
        fun of(bubble: BubbleContent?): ComposerReplyBanner {
            if (bubble == null) return ComposerReplyBanner(ReplyBannerAuthor.Unknown, null, ReplyBannerKind.Unloaded)
            val name = bubble.senderName?.trim()?.takeIf { it.isNotEmpty() }
            val author = when {
                bubble.isOutgoing -> ReplyBannerAuthor.Me
                name != null -> ReplyBannerAuthor.Named(name)
                else -> ReplyBannerAuthor.Unknown
            }
            val isProtected = bubble.isBlurred || bubble.isViewOnce
            val preview = bubble.text.trim().takeUnless { isProtected || it.isEmpty() }
            return ComposerReplyBanner(author, preview, kindOf(bubble))
        }

        private fun kindOf(bubble: BubbleContent): ReplyBannerKind = when {
            bubble.audios.isNotEmpty() -> ReplyBannerKind.Voice
            bubble.videoCount > 0 || bubble.files.any { it.isVideo } -> ReplyBannerKind.Video
            bubble.images.isNotEmpty() -> ReplyBannerKind.Photo
            bubble.locations.isNotEmpty() -> ReplyBannerKind.Location
            bubble.files.isNotEmpty() -> ReplyBannerKind.File
            else -> ReplyBannerKind.Text
        }
    }
}
