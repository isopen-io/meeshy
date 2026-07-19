package me.meeshy.app.feed

import me.meeshy.sdk.model.MoodStatusExpiry
import me.meeshy.sdk.model.StatusEntry

/**
 * One rendered slot in the mood-statuses bar — the pure decomposition of
 * [StatusesUiState] that the Compose `StatusBarView` renders. Mirrors iOS
 * `StatusBarView.body`'s `HStack`: a leading own/add cell, an optional inline
 * error-retry cell (shown ONLY on a cold empty failure), the other users'
 * pills (deduped against the own cell), and a trailing load-more spinner.
 */
sealed interface StatusBarCell {
    /** The signed-in user's own status — the "Moi" pill (tap → popover). */
    data class MyStatus(val entry: StatusEntry) : StatusBarCell

    /** No own status yet — the "+ Status" affordance (tap → composer). */
    data object AddStatus : StatusBarCell

    /**
     * A cold-empty load failed — a tappable retry chip. iOS shows this only when
     * `error != nil && statuses.isEmpty`, so a background-refresh failure over an
     * already-populated bar never surfaces here.
     */
    data object ErrorRetry : StatusBarCell

    /** Another user's status pill (tap → popover, onAppear → load-more). */
    data class Pill(val entry: StatusEntry) : StatusBarCell

    /** Trailing spinner while the next page loads. */
    data object LoadingMore : StatusBarCell
}

/**
 * Build the ordered bar cells for [state]. Pure and total: the leading cell is
 * always present (own status or the add affordance), the error-retry cell appears
 * only on a cold empty failure, the own status is never repeated as a pill, and
 * the load-more spinner trails the pills while a page is in flight.
 */
fun buildStatusBarCells(state: StatusesUiState): List<StatusBarCell> = buildList {
    add(state.myStatus?.let(StatusBarCell::MyStatus) ?: StatusBarCell.AddStatus)
    if (state.errorMessage != null && state.statuses.isEmpty()) add(StatusBarCell.ErrorRetry)
    val ownId = state.myStatus?.id
    state.statuses.asSequence()
        .filter { it.id != ownId }
        .forEach { add(StatusBarCell.Pill(it)) }
    if (state.isLoadingMore) add(StatusBarCell.LoadingMore)
}

/**
 * The content of a status popover (iOS `statusPopover`): the emoji, author, optional
 * text + "via" line, and the time-remaining shape from the [MoodStatusExpiry] law
 * ([MoodStatusExpiry.Remaining], `null` when the status has no derivable timestamp).
 * Localising the expired/"remaining" wording stays in the Composable.
 */
data class StatusPopoverModel(
    val moodEmoji: String,
    val username: String,
    val content: String?,
    val viaUsername: String?,
    val remaining: MoodStatusExpiry.Remaining?,
    val canRepublish: Boolean,
)

/**
 * Project [entry] into its popover model, deriving the countdown at [nowMillis].
 * [isOwn] gates the republish action: iOS shows "Republier" only on OTHER users'
 * statuses (`onRepublish != nil`), never on your own — so `canRepublish = !isOwn`.
 */
fun statusPopoverModel(
    entry: StatusEntry,
    nowMillis: Long,
    isOwn: Boolean = false,
): StatusPopoverModel =
    StatusPopoverModel(
        moodEmoji = entry.moodEmoji,
        username = entry.username,
        content = entry.content,
        viaUsername = entry.viaUsername,
        remaining = MoodStatusExpiry.remaining(
            createdAt = entry.createdAt,
            expiresAt = entry.expiresAt,
            nowMillis = nowMillis,
        ),
        canRepublish = !isOwn,
    )
