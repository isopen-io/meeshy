package me.meeshy.sdk.model.cache

/**
 * Cursor-pagination state of an infinite-scroll surface — the Android mirror of iOS
 * `PaginationState`. Deliberately distinct from [LoadState]: a list is [LoadState.Loaded]
 * AND [LoadingMore] at the same time, and conflating the two forces an `isLoadingMore`
 * boolean on top of an `isLoading` boolean.
 *
 * - [Idle]        — ready to fetch the next page.
 * - [LoadingMore] — a page is in flight (the screen shows a spinner row at the tail).
 * - [Exhausted]   — the gateway said `hasMore = false`; the tail spinner is gone for good.
 * - [Error]       — the last page failed; asking for the next page again resumes.
 */
public sealed interface PaginationState {
    public data object Idle : PaginationState
    public data object LoadingMore : PaginationState
    public data object Exhausted : PaginationState
    public data class Error(val message: String) : PaginationState

    /** Whether asking for the next page starts a request. */
    public val canLoadMore: Boolean
        get() = this is Idle || this is Error

    public companion object {
        /** The state a persisted [PaginationCursor] resumes into on a cold start. */
        public fun restore(cursor: PaginationCursor?): PaginationState =
            if (cursor != null && !cursor.hasMore) Exhausted else Idle
    }
}

public sealed interface PaginationEvent {
    public data object LoadMoreRequested : PaginationEvent

    /** A page landed; [hasMore] is the gateway's own verdict on whether another follows. */
    public data class PageLoaded(val hasMore: Boolean) : PaginationEvent

    public data class PageFailed(val message: String) : PaginationEvent

    /** Pull-to-refresh restarts the list from its first page. */
    public data object Reset : PaginationEvent
}

/**
 * The single transition function of [PaginationState]. A request is only started from a
 * state that [PaginationState.canLoadMore]; a late page never un-exhausts a list; a failure
 * with no page in flight is ignored.
 */
public object PaginationStateReducer {

    public fun reduce(state: PaginationState, event: PaginationEvent): PaginationState = when (event) {
        PaginationEvent.LoadMoreRequested ->
            if (state.canLoadMore) PaginationState.LoadingMore else state
        is PaginationEvent.PageLoaded -> when {
            state == PaginationState.Exhausted -> state
            event.hasMore -> PaginationState.Idle
            else -> PaginationState.Exhausted
        }
        is PaginationEvent.PageFailed ->
            if (state == PaginationState.LoadingMore) PaginationState.Error(event.message) else state
        PaginationEvent.Reset -> PaginationState.Idle
    }
}
