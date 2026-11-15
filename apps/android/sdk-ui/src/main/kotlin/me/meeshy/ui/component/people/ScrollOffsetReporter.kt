package me.meeshy.ui.component.people

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import me.meeshy.ui.component.chrome.CollapsibleHeaderMotion

/** La règle de rapport, pure : une progression 0..1 de repli d'en-tête, ou `null` quand l'onglet est inactif. */
public object ScrollOffsetReporting {
    public fun progress(
        active: Boolean,
        firstVisibleItemIndex: Int,
        firstVisibleItemScrollOffsetPx: Int,
        thresholdPx: Int,
    ): Float? =
        if (!active) null
        else CollapsibleHeaderMotion.collapseProgress(firstVisibleItemIndex, firstVisibleItemScrollOffsetPx, thresholdPx)
}

/**
 * Rapporte au hub la progression de repli (0..1) du défilement de [state] — l'en-tête se replie pendant que
 * les onglets restent épinglés (iOS `reportsContactsScroll`). Un onglet hors écran ([active] faux) reste muet.
 */
@Composable
public fun ScrollOffsetReporter(
    state: LazyListState,
    active: Boolean,
    onProgress: (Float) -> Unit,
    threshold: Dp = 120.dp,
) {
    val thresholdPx = with(LocalDensity.current) { threshold.roundToPx() }
    val latest by rememberUpdatedState(onProgress)
    LaunchedEffect(state, active, thresholdPx) {
        snapshotFlow {
            ScrollOffsetReporting.progress(
                active = active,
                firstVisibleItemIndex = state.firstVisibleItemIndex,
                firstVisibleItemScrollOffsetPx = state.firstVisibleItemScrollOffset,
                thresholdPx = thresholdPx,
            )
        }
            .filterNotNull()
            .distinctUntilChanged()
            .collect { latest(it) }
    }
}
