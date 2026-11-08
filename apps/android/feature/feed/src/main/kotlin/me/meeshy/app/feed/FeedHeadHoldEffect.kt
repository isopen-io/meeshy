package me.meeshy.app.feed

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import me.meeshy.sdk.model.feed.FeedHeadHold

/**
 * L'écran pilote la retenue de tête (#16676, [FeedHeadHold]) : il retient tant que le premier élément visible est un
 * post (au-delà des [headItems] lignes de tête) ou que le fil n'est pas à l'écran (cycle de vie sous RESUMED : une
 * feuille par-dessus, une autre destination, l'arrière-plan) ; il cesse de retenir quand le lecteur revient en haut.
 * Quitter la composition (le fil mis de côté) retient aussi, jusqu'au retour.
 */
@Composable
internal fun FeedHeadHoldEffect(listState: LazyListState, headItems: Int, onHolding: (Boolean) -> Unit) {
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val displayed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    val holding by remember(listState, displayed, headItems) {
        derivedStateOf { FeedHeadHold.holds(displayed, listState.firstVisibleItemIndex, headItems) }
    }
    val currentOnHolding by rememberUpdatedState(onHolding)
    LaunchedEffect(holding) { currentOnHolding(holding) }
    DisposableEffect(Unit) { onDispose { currentOnHolding(true) } }
}
