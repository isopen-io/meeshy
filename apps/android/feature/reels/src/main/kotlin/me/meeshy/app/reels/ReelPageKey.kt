package me.meeshy.app.reels

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.pager.PagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.tracing.trace
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.sdk.model.ReelPlaybackElection

/**
 * La clé d'une page du fil de réels (iOS `ReelInstantSwitch`) : ce qui, d'une page, décide si elle se
 * recompose. Quatre primitives — le réel, élu, posé, chrome masqué — comparées par valeur : une élection ne
 * change la clé que des deux pages touchées (la sortante et l'entrante), jamais des autres.
 */
@Stable
internal data class ReelPageKey(
    val reelId: String,
    val isElected: Boolean,
    val isSettled: Boolean,
    val chromeHidden: Boolean,
) {
    companion object {
        fun of(reelId: String, election: ReelPlaybackElection, chromeHidden: Boolean): ReelPageKey =
            ReelPageKey(
                reelId = reelId,
                isElected = election.activeId == reelId,
                isSettled = election.restingId == reelId,
                chromeHidden = chromeHidden,
            )
    }
}

/**
 * Les trois signaux du pager réduits à l'élection (iOS `ReelPlaybackElection`) : la page qui passe la moitié
 * de l'écran est élue PENDANT le geste, la page posée n'est confirmée qu'à l'arrêt du défilement.
 */
internal object ReelElectionReducer {
    fun reduce(
        election: ReelPlaybackElection,
        majorityId: String?,
        isScrolling: Boolean,
        settledId: String?,
    ): ReelPlaybackElection {
        val elected = majorityId?.let(election::majority) ?: election
        val scrolled = elected.scrolling(isScrolling)
        return if (isScrolling) scrolled else scrolled.settled(settledId)
    }
}

/**
 * L'élection du pager, suivie PENDANT le geste : la page qui passe la moitié de l'écran est élue sans attendre
 * l'arrêt du défilement ; la page posée suit à l'arrêt. Le changement d'élu ouvre la section de trace `reel.switch`.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun rememberReelElection(pagerState: PagerState, reelIds: List<String>): State<ReelPlaybackElection> {
    val election = remember { mutableStateOf(ReelPlaybackElection(activeId = reelIds.getOrNull(pagerState.currentPage))) }
    LaunchedEffect(pagerState, reelIds) {
        snapshotFlow { Triple(pagerState.currentPage, pagerState.isScrollInProgress, pagerState.settledPage) }
            .distinctUntilChanged()
            .collect { (current, scrolling, settled) ->
                val previous = election.value
                val next = ReelElectionReducer.reduce(previous, reelIds.getOrNull(current), scrolling, reelIds.getOrNull(settled))
                if (next.activeId != previous.activeId) {
                    trace("reel.switch") { election.value = next }
                } else {
                    election.value = next
                }
            }
    }
    return election
}
