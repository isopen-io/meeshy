package me.meeshy.app.reels

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.reels.R
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.ui.component.ContentFetchFailureView
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshyShimmerPlaceholder
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que le pager rend quand il n'a aucun reel (iOS `ReelsPlayerView+EmptyState`). */
sealed interface ReelEmptyKind {
    /** Premier chargement pas encore termine : placeholder shimmer, jamais un spinner nu. */
    data object Cold : ReelEmptyKind

    /** Reponse 200 sans aucun reel. */
    data object Empty : ReelEmptyKind

    /** Panne : dit la cause et n'offre « Reessayer » que si elle peut aboutir. */
    data class Failed(val failure: ContentFetchFailure) : ReelEmptyKind

    companion object {
        fun of(state: ReelsUiState): ReelEmptyKind = when {
            state.loadFailure != null -> Failed(state.loadFailure)
            state.hasLoadedOnce -> Empty
            else -> Cold
        }
    }
}

@Composable
internal fun ReelEmptyStates(state: ReelsUiState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    when (val kind = ReelEmptyKind.of(state)) {
        ReelEmptyKind.Cold -> MeeshyShimmerPlaceholder(modifier, base = MeeshyMediaChromeColors.OnMedia.copy(alpha = 0.12f))
        ReelEmptyKind.Empty -> MeeshyTheme(darkTheme = true) {
            Box(modifier.fillMaxSize()) {
                MeeshyEmptyState(
                    icon = Icons.Filled.VideoLibrary,
                    title = stringResource(R.string.reels_empty),
                    subtitle = "",
                    accent = MeeshyMediaChromeColors.OnMedia,
                )
            }
        }
        is ReelEmptyKind.Failed -> MeeshyTheme(darkTheme = true) {
            ContentFetchFailureView(kind.failure, modifier, onRetry = onRetry)
        }
    }
}
