package me.meeshy.app.feed

/**
 * A feedback the feed shows once, in the reader's language — never the raw technical message
 * a failed call carries. Mirrors iOS `FeedbackToastManager` and its keys (`feed.load.error`,
 * `feed.repost.error`, `feed.post.reported`, `feed.post.toast.published`…); the screen maps each
 * value to its string through [FeedNotice.messageRes].
 */
enum class FeedNotice(val isError: Boolean) {
    LOAD_FAILED(true),
    LIKE_FAILED(true),
    BOOKMARK_FAILED(true),
    REPOST_FAILED(true),
    PIN_FAILED(true),
    DELETE_FAILED(true),
    REPORT_FAILED(true),
    REPORTED(false),
    PUBLISH_FAILED(true),
    PUBLISHED(false),
    TRANSLATION_FAILED(true),
}
