package me.meeshy.sdk.model.cache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pagination is a state machine DISTINCT from [LoadState]: a list is `Loaded` AND
 * `LoadingMore` at the same time. These laws mirror iOS `PaginationState`.
 */
class PaginationStateTest {

    private fun reduce(state: PaginationState, event: PaginationEvent): PaginationState =
        PaginationStateReducer.reduce(state, event)

    // ── Load more ──────────────────────────────────────────────────────────────

    @Test
    fun `asking for the next page from Idle starts loading more`() {
        assertThat(reduce(PaginationState.Idle, PaginationEvent.LoadMoreRequested))
            .isEqualTo(PaginationState.LoadingMore)
    }

    @Test
    fun `asking for the next page while one is in flight changes nothing`() {
        assertThat(reduce(PaginationState.LoadingMore, PaginationEvent.LoadMoreRequested))
            .isEqualTo(PaginationState.LoadingMore)
    }

    @Test
    fun `asking for the next page once exhausted changes nothing`() {
        assertThat(reduce(PaginationState.Exhausted, PaginationEvent.LoadMoreRequested))
            .isEqualTo(PaginationState.Exhausted)
    }

    // ── Page outcomes ──────────────────────────────────────────────────────────

    @Test
    fun `a page with more behind it returns to Idle`() {
        assertThat(reduce(PaginationState.LoadingMore, PaginationEvent.PageLoaded(hasMore = true)))
            .isEqualTo(PaginationState.Idle)
    }

    @Test
    fun `a page without more behind it exhausts the list`() {
        assertThat(reduce(PaginationState.LoadingMore, PaginationEvent.PageLoaded(hasMore = false)))
            .isEqualTo(PaginationState.Exhausted)
    }

    @Test
    fun `the first page also tells whether the list is already exhausted`() {
        assertThat(reduce(PaginationState.Idle, PaginationEvent.PageLoaded(hasMore = false)))
            .isEqualTo(PaginationState.Exhausted)
        assertThat(reduce(PaginationState.Idle, PaginationEvent.PageLoaded(hasMore = true)))
            .isEqualTo(PaginationState.Idle)
    }

    @Test
    fun `a late page can never un-exhaust a list`() {
        assertThat(reduce(PaginationState.Exhausted, PaginationEvent.PageLoaded(hasMore = true)))
            .isEqualTo(PaginationState.Exhausted)
    }

    // ── Errors and resume ──────────────────────────────────────────────────────

    @Test
    fun `a failed page keeps its message in Error`() {
        assertThat(reduce(PaginationState.LoadingMore, PaginationEvent.PageFailed("timeout")))
            .isEqualTo(PaginationState.Error("timeout"))
    }

    @Test
    fun `a failure with no page in flight is ignored`() {
        assertThat(reduce(PaginationState.Idle, PaginationEvent.PageFailed("late")))
            .isEqualTo(PaginationState.Idle)
        assertThat(reduce(PaginationState.Exhausted, PaginationEvent.PageFailed("late")))
            .isEqualTo(PaginationState.Exhausted)
    }

    @Test
    fun `asking for the next page after an error resumes loading`() {
        val failed = reduce(PaginationState.LoadingMore, PaginationEvent.PageFailed("timeout"))
        assertThat(reduce(failed, PaginationEvent.LoadMoreRequested)).isEqualTo(PaginationState.LoadingMore)
    }

    @Test
    fun `a resumed page that succeeds goes back to Idle or Exhausted`() {
        val resumed = reduce(PaginationState.Error("timeout"), PaginationEvent.LoadMoreRequested)
        assertThat(reduce(resumed, PaginationEvent.PageLoaded(hasMore = true))).isEqualTo(PaginationState.Idle)
        assertThat(reduce(resumed, PaginationEvent.PageLoaded(hasMore = false))).isEqualTo(PaginationState.Exhausted)
    }

    @Test
    fun `only Idle and Error accept a new page request`() {
        assertThat(PaginationState.Idle.canLoadMore).isTrue()
        assertThat(PaginationState.Error("x").canLoadMore).isTrue()
        assertThat(PaginationState.LoadingMore.canLoadMore).isFalse()
        assertThat(PaginationState.Exhausted.canLoadMore).isFalse()
    }

    // ── Reset (pull to refresh) ────────────────────────────────────────────────

    @Test
    fun `reset reopens an exhausted list`() {
        assertThat(reduce(PaginationState.Exhausted, PaginationEvent.Reset)).isEqualTo(PaginationState.Idle)
    }

    @Test
    fun `reset clears an error`() {
        assertThat(reduce(PaginationState.Error("x"), PaginationEvent.Reset)).isEqualTo(PaginationState.Idle)
    }

    // ── Restore from a persisted cursor ────────────────────────────────────────

    @Test
    fun `no persisted cursor restores to Idle`() {
        assertThat(PaginationState.restore(null)).isEqualTo(PaginationState.Idle)
    }

    @Test
    fun `a persisted cursor with more restores to Idle`() {
        assertThat(PaginationState.restore(PaginationCursor(nextCursor = "m42", hasMore = true)))
            .isEqualTo(PaginationState.Idle)
    }

    @Test
    fun `a persisted cursor without more restores to Exhausted`() {
        assertThat(PaginationState.restore(PaginationCursor(nextCursor = null, hasMore = false)))
            .isEqualTo(PaginationState.Exhausted)
    }
}
