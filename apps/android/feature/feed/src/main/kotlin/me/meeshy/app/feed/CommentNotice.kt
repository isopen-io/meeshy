package me.meeshy.app.feed

import androidx.annotation.StringRes
import me.meeshy.feature.feed.R

/**
 * A one-shot feedback of the comment thread, in the reader's language — the iOS toast keys
 * (`feed.comment.loadError`, `feed.comment.sendError`, `feed.comment.replyError`,
 * `feed.comments.deleted`, `feed.comments.delete_error`) adopted through the catalog.
 */
enum class CommentNotice(@StringRes val messageRes: Int) {
    LOAD_FAILED(R.string.post_comments_load_error),
    SEND_FAILED(R.string.post_comments_send_error),
    REPLY_FAILED(R.string.post_comments_reply_error),
    DELETED(R.string.post_comments_deleted),
    DELETE_FAILED(R.string.post_comments_delete_error),
    MEDIA_FAILED(R.string.feed_composer_media_unusable),
}
