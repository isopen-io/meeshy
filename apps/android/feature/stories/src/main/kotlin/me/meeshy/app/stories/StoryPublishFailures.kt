package me.meeshy.app.stories

import me.meeshy.sdk.story.FailedStoryPublish

/**
 * Projects exhausted outbox publishes ([FailedStoryPublish]) onto compact
 * "failed to post" items for the tray's failure strip. Pure product rule:
 * newest failure first, content collapsed to a single-line preview.
 *
 * Surpasses iOS: iOS's optimistic story silently evaporates when a publish
 * fails — no signal, no recovery. Android surfaces every exhausted publish
 * (derived from the durable outbox, so it survives process death) with an
 * explicit retry / discard keyed by [FailedStoryPublish.cmid].
 *
 * This object holds only the presentation rule; the queue semantics
 * (which rows are failed, how to retry/discard) live in the SDK
 * [me.meeshy.sdk.story.StoryRepository].
 */
object StoryPublishFailures {

    /** A failed publish rendered for the strip — [cmid] targets the retry/discard. */
    data class Item(
        val cmid: String,
        val preview: String,
        val failedAtMillis: Long,
    )

    /**
     * Failure items for [failed], most-recently-failed first (stable for ties so a
     * batch that failed together keeps its enqueue order). Each content is collapsed
     * to a single-line [PREVIEW_MAX]-char preview, ellipsised when truncated, so a
     * long story stays one tidy strip row.
     */
    fun from(failed: List<FailedStoryPublish>): List<Item> =
        failed
            .sortedByDescending { it.failedAtMillis }
            .map { Item(cmid = it.cmid, preview = it.content.preview(), failedAtMillis = it.failedAtMillis) }

    private fun String.preview(): String {
        val single = trim().replace(WHITESPACE_RUN, " ")
        return if (single.length <= PREVIEW_MAX) single else single.take(PREVIEW_MAX).trimEnd() + ELLIPSIS
    }

    const val PREVIEW_MAX: Int = 80
    private const val ELLIPSIS = "…"
    private val WHITESPACE_RUN = Regex("\\s+")
}
