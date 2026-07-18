package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPostComment
import org.junit.Test

class CommentRepliesStateTest {

    private fun reply(id: String, parentId: String = "c1") =
        ApiPostComment(id = id, content = "r", parentId = parentId)

    @Test
    fun `fresh state has no expanded, loading or loaded threads`() {
        val s = CommentRepliesState()
        assertThat(s.isExpanded("c1")).isFalse()
        assertThat(s.isLoading("c1")).isFalse()
        assertThat(s.isLoaded("c1")).isFalse()
        assertThat(s.repliesFor("c1")).isEmpty()
    }

    @Test
    fun `expanded marks the thread open`() {
        val s = CommentRepliesState().expanded("c1")
        assertThat(s.isExpanded("c1")).isTrue()
        assertThat(s.isExpanded("c2")).isFalse()
    }

    @Test
    fun `expanded is idempotent`() {
        val s = CommentRepliesState().expanded("c1")
        assertThat(s.expanded("c1")).isEqualTo(s)
    }

    @Test
    fun `collapsed closes an open thread`() {
        val s = CommentRepliesState().expanded("c1").collapsed("c1")
        assertThat(s.isExpanded("c1")).isFalse()
    }

    @Test
    fun `collapsed is inert when the thread is not open`() {
        val s = CommentRepliesState()
        assertThat(s.collapsed("c1")).isEqualTo(s)
    }

    @Test
    fun `beginLoad marks the thread loading and returns the new state`() {
        val began = CommentRepliesState().beginLoad("c1")
        assertThat(began).isNotNull()
        assertThat(began!!.isLoading("c1")).isTrue()
    }

    @Test
    fun `beginLoad returns null when a load is already in flight`() {
        val began = CommentRepliesState().beginLoad("c1")!!
        assertThat(began.beginLoad("c1")).isNull()
    }

    @Test
    fun `beginLoad returns null when the thread is already loaded`() {
        val loaded = CommentRepliesState().beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
        assertThat(loaded.beginLoad("c1")).isNull()
    }

    @Test
    fun `loaded stores the replies, marks loaded and clears loading`() {
        val s = CommentRepliesState().beginLoad("c1")!!.loaded("c1", listOf(reply("r1"), reply("r2")))
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("r1", "r2").inOrder()
        assertThat(s.isLoaded("c1")).isTrue()
        assertThat(s.isLoading("c1")).isFalse()
    }

    @Test
    fun `loaded stores an empty reply list yet still marks the thread loaded`() {
        val s = CommentRepliesState().beginLoad("c1")!!.loaded("c1", emptyList())
        assertThat(s.repliesFor("c1")).isEmpty()
        assertThat(s.isLoaded("c1")).isTrue()
        assertThat(s.beginLoad("c1")).isNull()
    }

    @Test
    fun `failed clears loading and collapses the thread`() {
        val s = CommentRepliesState().expanded("c1").beginLoad("c1")!!.failed("c1")
        assertThat(s.isLoading("c1")).isFalse()
        assertThat(s.isExpanded("c1")).isFalse()
        assertThat(s.isLoaded("c1")).isFalse()
    }

    @Test
    fun `failed leaves the thread reloadable`() {
        val s = CommentRepliesState().expanded("c1").beginLoad("c1")!!.failed("c1")
        assertThat(s.beginLoad("c1")).isNotNull()
    }

    @Test
    fun `a collapsed then re-expanded loaded thread is not reloaded`() {
        val s = CommentRepliesState()
            .expanded("c1").beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
            .collapsed("c1").expanded("c1")
        assertThat(s.isExpanded("c1")).isTrue()
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("r1")
        assertThat(s.beginLoad("c1")).isNull()
    }

    @Test
    fun `distinct threads track expansion and replies independently`() {
        val s = CommentRepliesState()
            .expanded("c1").beginLoad("c1")!!.loaded("c1", listOf(reply("r1", "c1")))
            .expanded("c2")
        assertThat(s.isExpanded("c1")).isTrue()
        assertThat(s.isExpanded("c2")).isTrue()
        assertThat(s.isLoaded("c1")).isTrue()
        assertThat(s.isLoaded("c2")).isFalse()
        assertThat(s.repliesFor("c2")).isEmpty()
    }

    // --- Reply composition ---

    @Test
    fun `optimisticReply expands the thread and prepends a pending reply`() {
        val s = CommentRepliesState().optimisticReply("c1", reply("temp"))
        assertThat(s.isExpanded("c1")).isTrue()
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("temp")
        assertThat(s.isPendingReply("temp")).isTrue()
    }

    @Test
    fun `optimisticReply prepends ahead of existing loaded replies`() {
        val s = CommentRepliesState()
            .expanded("c1").beginLoad("c1")!!.loaded("c1", listOf(reply("r1"), reply("r2")))
            .optimisticReply("c1", reply("temp"))
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("temp", "r1", "r2").inOrder()
    }

    @Test
    fun `optimisticReply does not mark the thread loaded so existing replies stay fetchable`() {
        val s = CommentRepliesState().optimisticReply("c1", reply("temp"))
        assertThat(s.isLoaded("c1")).isFalse()
        assertThat(s.beginLoad("c1")).isNotNull()
    }

    @Test
    fun `confirmedReply swaps the temp row for the server row and clears pending`() {
        val s = CommentRepliesState()
            .optimisticReply("c1", reply("temp"))
            .confirmedReply("c1", "temp", reply("real"))
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("real")
        assertThat(s.isPendingReply("temp")).isFalse()
        assertThat(s.isPendingReply("real")).isFalse()
    }

    @Test
    fun `confirmedReply preserves reply order when swapping`() {
        val s = CommentRepliesState()
            .expanded("c1").beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
            .optimisticReply("c1", reply("temp"))
            .confirmedReply("c1", "temp", reply("real"))
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("real", "r1").inOrder()
    }

    @Test
    fun `confirmedReply is inert when the temp id is not pending`() {
        val base = CommentRepliesState().expanded("c1").beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
        assertThat(base.confirmedReply("c1", "ghost", reply("real"))).isEqualTo(base)
    }

    @Test
    fun `failedReply removes the optimistic row and clears pending`() {
        val s = CommentRepliesState()
            .expanded("c1").beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
            .optimisticReply("c1", reply("temp"))
            .failedReply("c1", "temp")
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("r1")
        assertThat(s.isPendingReply("temp")).isFalse()
    }

    @Test
    fun `failedReply is inert when the temp id is not pending`() {
        val base = CommentRepliesState().expanded("c1").beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
        assertThat(base.failedReply("c1", "ghost")).isEqualTo(base)
    }

    @Test
    fun `isPendingReply is false for a fresh state`() {
        assertThat(CommentRepliesState().isPendingReply("temp")).isFalse()
    }

    // --- Preview preloading ---

    @Test
    fun `beginLoadAll marks every fresh id loading without expanding`() {
        val s = CommentRepliesState().beginLoadAll(listOf("c1", "c2"))
        assertThat(s.isLoading("c1")).isTrue()
        assertThat(s.isLoading("c2")).isTrue()
        assertThat(s.isExpanded("c1")).isFalse()
        assertThat(s.isExpanded("c2")).isFalse()
    }

    @Test
    fun `beginLoadAll skips ids already loading or loaded`() {
        val base = CommentRepliesState().beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
            .beginLoad("c2")!! // c1 loaded, c2 loading
        val s = base.beginLoadAll(listOf("c1", "c2", "c3"))
        assertThat(s.isLoading("c3")).isTrue()
        assertThat(s.isLoaded("c1")).isTrue()
        assertThat(s.isLoading("c1")).isFalse()
        assertThat(s.isLoading("c2")).isTrue()
    }

    @Test
    fun `beginLoadAll is inert for an empty batch`() {
        val base = CommentRepliesState().expanded("c1")
        assertThat(base.beginLoadAll(emptyList())).isEqualTo(base)
    }

    @Test
    fun `beginLoadAll is inert when every id is already loaded or loading`() {
        val base = CommentRepliesState().beginLoad("c1")!!.loaded("c1", emptyList()).beginLoad("c2")!!
        assertThat(base.beginLoadAll(listOf("c1", "c2"))).isEqualTo(base)
    }

    @Test
    fun `previewTargets returns the first fresh candidates up to the limit`() {
        val s = CommentRepliesState()
        assertThat(s.previewTargets(listOf("c1", "c2", "c3"), 2)).containsExactly("c1", "c2").inOrder()
    }

    @Test
    fun `previewTargets returns all candidates when fewer than the limit`() {
        val s = CommentRepliesState()
        assertThat(s.previewTargets(listOf("c1"), 5)).containsExactly("c1")
    }

    @Test
    fun `previewTargets is empty for a non-positive limit`() {
        val s = CommentRepliesState()
        assertThat(s.previewTargets(listOf("c1", "c2"), 0)).isEmpty()
        assertThat(s.previewTargets(listOf("c1", "c2"), -1)).isEmpty()
    }

    @Test
    fun `previewTargets is empty when there are no candidates`() {
        assertThat(CommentRepliesState().previewTargets(emptyList(), 5)).isEmpty()
    }

    @Test
    fun `previewTargets drops candidates already loaded or in flight`() {
        val s = CommentRepliesState().beginLoad("c1")!!.loaded("c1", emptyList()).beginLoad("c2")!!
        assertThat(s.previewTargets(listOf("c1", "c2", "c3"), 5)).containsExactly("c3")
    }

    @Test
    fun `previewTargets bounds to the first limit before dropping loaded ones`() {
        // c1 is loaded; the window is the first 2 (c1, c2), so only c2 survives — c3 is out of the window.
        val s = CommentRepliesState().beginLoad("c1")!!.loaded("c1", emptyList())
        assertThat(s.previewTargets(listOf("c1", "c2", "c3"), 2)).containsExactly("c2")
    }

    @Test
    fun `receivedReply prepends a live reply into a loaded thread`() {
        val s = CommentRepliesState()
            .beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
            .receivedReply("c1", reply("live"))
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("live", "r1").inOrder()
    }

    @Test
    fun `receivedReply inserts into an expanded but not-yet-loaded thread`() {
        val s = CommentRepliesState().expanded("c1").receivedReply("c1", reply("live"))
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("live")
    }

    @Test
    fun `receivedReply is inert when the thread is neither expanded nor loaded`() {
        val base = CommentRepliesState()
        assertThat(base.receivedReply("c1", reply("live"))).isSameInstanceAs(base)
        assertThat(base.repliesFor("c1")).isEmpty()
    }

    @Test
    fun `receivedReply dedups a reply already present`() {
        val base = CommentRepliesState().beginLoad("c1")!!.loaded("c1", listOf(reply("r1")))
        assertThat(base.receivedReply("c1", reply("r1"))).isSameInstanceAs(base)
    }

    @Test
    fun `receivedReply does not mark the live reply pending`() {
        val s = CommentRepliesState()
            .beginLoad("c1")!!.loaded("c1", emptyList())
            .receivedReply("c1", reply("live"))
        assertThat(s.isPendingReply("live")).isFalse()
        assertThat(s.pendingReplyIds).isEmpty()
    }

    @Test
    fun `receivedReply leaves an optimistic pending reply untouched`() {
        val s = CommentRepliesState()
            .beginLoad("c1")!!.loaded("c1", emptyList())
            .optimisticReply("c1", reply("pending-0"))
            .receivedReply("c1", reply("live"))
        assertThat(s.repliesFor("c1").map { it.id }).containsExactly("live", "pending-0").inOrder()
        assertThat(s.pendingReplyIds).containsExactly("pending-0")
    }
}
