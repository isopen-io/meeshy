package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPostComment
import org.junit.Test

/**
 * The pure accumulation SSOT for a post's comment thread: fetched pages fold in with
 * de-dup + watermark advance, and a just-sent comment is prepended optimistically then
 * either confirmed (swapped for the server row) or rolled back (removed) — never a crash,
 * never a duplicate.
 */
class CommentThreadStateTest {

    private fun comment(id: String, parentId: String? = null) =
        ApiPostComment(id = id, content = "c$id", parentId = parentId)

    @Test
    fun appended_populatesAndAdvancesWatermark() {
        val state = CommentThreadState().appended(
            page = listOf(comment("a"), comment("b")),
            nextCursor = "cur1",
            more = true,
        )
        assertThat(state.comments.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(state.cursor).isEqualTo("cur1")
        assertThat(state.hasMore).isTrue()
        assertThat(state.hasLoaded).isTrue()
        assertThat(state.canLoadMore).isTrue()
    }

    @Test
    fun appended_emptyPageStillMarksLoaded() {
        val state = CommentThreadState().appended(page = emptyList(), nextCursor = null, more = false)
        assertThat(state.comments).isEmpty()
        assertThat(state.hasLoaded).isTrue()
        assertThat(state.isEmpty).isTrue()
        assertThat(state.canLoadMore).isFalse()
    }

    @Test
    fun appended_deDupsByIdKeepingExisting() {
        val state = CommentThreadState()
            .appended(listOf(comment("a"), comment("b")), "c1", true)
            .appended(listOf(comment("b"), comment("c")), "c2", false)
        assertThat(state.comments.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun canLoadMore_falseWhenHasMoreButCursorMissing() {
        // A malformed hasMore-with-no-cursor tail must not spin an endless load.
        val state = CommentThreadState().appended(listOf(comment("a")), nextCursor = null, more = true)
        assertThat(state.hasMore).isTrue()
        assertThat(state.canLoadMore).isFalse()
    }

    @Test
    fun canLoadMore_falseWhenCursorBlank() {
        val state = CommentThreadState().appended(listOf(comment("a")), nextCursor = "  ", more = true)
        assertThat(state.canLoadMore).isFalse()
    }

    @Test
    fun optimistic_prependsAndMarksPending() {
        val state = CommentThreadState()
            .appended(listOf(comment("a")), "c1", false)
            .optimistic(comment("temp"))
        assertThat(state.comments.map { it.id }).containsExactly("temp", "a").inOrder()
        assertThat(state.pendingIds).containsExactly("temp")
    }

    @Test
    fun optimistic_inertForAlreadyPresentId() {
        val state = CommentThreadState()
            .appended(listOf(comment("a")), "c1", false)
            .optimistic(comment("a"))
        assertThat(state.comments.map { it.id }).containsExactly("a")
        assertThat(state.pendingIds).isEmpty()
    }

    @Test
    fun confirmed_swapsTempForServerRowAndClearsPending() {
        val server = comment("real").copy(content = "confirmed")
        val state = CommentThreadState()
            .optimistic(comment("temp"))
            .confirmed("temp", server)
        assertThat(state.comments.map { it.id }).containsExactly("real")
        assertThat(state.comments.single().content).isEqualTo("confirmed")
        assertThat(state.pendingIds).isEmpty()
    }

    @Test
    fun confirmed_inertWhenTempIdNotPending() {
        val state = CommentThreadState()
            .appended(listOf(comment("a")), "c1", false)
            .confirmed("ghost", comment("real"))
        assertThat(state.comments.map { it.id }).containsExactly("a")
    }

    @Test
    fun failed_removesOptimisticAndClearsPending() {
        val state = CommentThreadState()
            .appended(listOf(comment("a")), "c1", false)
            .optimistic(comment("temp"))
            .failed("temp")
        assertThat(state.comments.map { it.id }).containsExactly("a")
        assertThat(state.pendingIds).isEmpty()
    }

    @Test
    fun failed_inertForAbsentId() {
        val base = CommentThreadState().appended(listOf(comment("a")), "c1", false)
        assertThat(base.failed("nope")).isEqualTo(base)
    }

    private fun commentWithReplies(id: String, replyCount: Int?) =
        ApiPostComment(id = id, content = "c", replyCount = replyCount)

    @Test
    fun bumpReplyCount_incrementsTheMatchingParent() {
        val state = CommentThreadState()
            .appended(listOf(commentWithReplies("a", 2)), null, false)
            .bumpReplyCount("a", 1)
        assertThat(state.comments.single { it.id == "a" }.replyCount).isEqualTo(3)
    }

    @Test
    fun bumpReplyCount_treatsNullReplyCountAsZero() {
        val state = CommentThreadState()
            .appended(listOf(commentWithReplies("a", null)), null, false)
            .bumpReplyCount("a", 1)
        assertThat(state.comments.single { it.id == "a" }.replyCount).isEqualTo(1)
    }

    @Test
    fun bumpReplyCount_neverGoesBelowZero() {
        val state = CommentThreadState()
            .appended(listOf(commentWithReplies("a", 0)), null, false)
            .bumpReplyCount("a", -1)
        assertThat(state.comments.single { it.id == "a" }.replyCount).isEqualTo(0)
    }

    @Test
    fun bumpReplyCount_inertForUnknownParent() {
        val base = CommentThreadState().appended(listOf(commentWithReplies("a", 2)), null, false)
        assertThat(base.bumpReplyCount("zzz", 1)).isEqualTo(base)
    }

    @Test
    fun bumpReplyCount_leavesOtherCommentsUntouched() {
        val state = CommentThreadState()
            .appended(listOf(commentWithReplies("a", 1), commentWithReplies("b", 4)), null, false)
            .bumpReplyCount("a", 1)
        assertThat(state.comments.single { it.id == "b" }.replyCount).isEqualTo(4)
    }

    @Test
    fun received_prependsALiveTopLevelComment() {
        val state = CommentThreadState()
            .appended(listOf(comment("a"), comment("b")), null, false)
            .received(comment("live"))
        assertThat(state.comments.map { it.id }).containsExactly("live", "a", "b").inOrder()
    }

    @Test
    fun received_intoAnEmptyThread() {
        val state = CommentThreadState().received(comment("live"))
        assertThat(state.comments.map { it.id }).containsExactly("live")
    }

    @Test
    fun received_dedupsAnAlreadyPresentComment() {
        val base = CommentThreadState().appended(listOf(comment("a")), null, false)
        assertThat(base.received(comment("a"))).isSameInstanceAs(base)
    }

    @Test
    fun received_doesNotMarkTheLiveCommentPending() {
        val state = CommentThreadState().received(comment("live"))
        assertThat(state.pendingIds).doesNotContain("live")
        assertThat(state.pendingIds).isEmpty()
    }

    @Test
    fun received_leavesAnOptimisticPendingCommentUntouched() {
        val state = CommentThreadState()
            .optimistic(comment("pending-0"))
            .received(comment("live"))
        assertThat(state.comments.map { it.id }).containsExactly("live", "pending-0").inOrder()
        assertThat(state.pendingIds).containsExactly("pending-0")
    }

    @Test
    fun removed_dropsALiveDeletedTopLevelComment() {
        val state = CommentThreadState()
            .appended(listOf(comment("a"), comment("b"), comment("c")), null, false)
            .removed("b")
        assertThat(state.comments.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun removed_inertForAnUnknownComment() {
        val base = CommentThreadState().appended(listOf(comment("a")), null, false)
        assertThat(base.removed("zzz")).isSameInstanceAs(base)
    }

    @Test
    fun removed_inertOnAnEmptyThread() {
        val base = CommentThreadState()
        assertThat(base.removed("a")).isSameInstanceAs(base)
    }

    @Test
    fun removed_clearsThePendingMarkOfADeletedOptimisticRow() {
        val state = CommentThreadState()
            .optimistic(comment("pending-0"))
            .removed("pending-0")
        assertThat(state.comments).isEmpty()
        assertThat(state.pendingIds).isEmpty()
    }

    @Test
    fun removed_leavesOtherPendingMarksUntouched() {
        val state = CommentThreadState()
            .optimistic(comment("pending-0"))
            .optimistic(comment("pending-1"))
            .removed("pending-0")
        assertThat(state.comments.map { it.id }).containsExactly("pending-1")
        assertThat(state.pendingIds).containsExactly("pending-1")
    }
}
