package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.comments.CommentsSheetInput
import me.meeshy.sdk.model.comments.CommentsSheetUi
import me.meeshy.sdk.model.comments.CommentsUiStateReducer
import me.meeshy.ui.component.comments.CommentsListState
import me.meeshy.ui.component.comments.CommentsSheetLabels

/** Les faits du fil des posts, lus par le réducteur de la feuille unique (cache-first : le squelette seulement à froid). */
internal fun PostCommentsUiState.sheetUi(isOffline: Boolean): CommentsSheetUi = CommentsUiStateReducer.reduce(
    CommentsSheetInput(
        loadedRows = comments.size,
        isLoading = showSkeleton || isLoading,
        loadFailed = loadFailed,
        isOffline = isOffline,
        hasSettled = isEmpty || comments.isNotEmpty() || loadFailed,
    ),
)

internal fun PostCommentsUiState.listState(isOffline: Boolean): CommentsListState {
    val ui = sheetUi(isOffline)
    return CommentsListState(
        phase = ui.phase,
        showsOfflineBand = ui.showsOfflineBand,
        canLoadMore = canLoadMore,
        isLoadingMore = isLoadingMore,
    )
}

@Composable
internal fun rememberCommentsLabels(title: String): CommentsSheetLabels {
    val closeLabel = stringResource(me.meeshy.ui.R.string.common_close)
    val loadError = stringResource(R.string.post_comments_load_error)
    val retry = stringResource(R.string.feed_retry)
    val empty = stringResource(R.string.post_comments_empty)
    val offline = stringResource(R.string.feed_offline_banner)
    val offlineEmpty = stringResource(R.string.feed_offline_empty_title)
    val loadMore = stringResource(R.string.post_comments_load_more)
    return remember(title, closeLabel, loadError, retry, empty, offline, offlineEmpty, loadMore) {
        CommentsSheetLabels(title, closeLabel, loadError, retry, empty, offline, offlineEmpty, loadMore)
    }
}
