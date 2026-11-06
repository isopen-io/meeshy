package me.meeshy.app.chat

import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.withFrameNanos
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw
import me.meeshy.ui.component.focal.FlatRowExpansion
import me.meeshy.ui.component.focal.LocalFlatRowExpansion

/**
 * L'hôte du dépliage des longs messages du fil (iOS `MessageListViewController+LongMessage`, #16463) : il tient
 * l'état ([LongMessageExpansionState], plusieurs dépliés, aucun repli) et retient immobile le HAUT du message qui
 * grandit, en compensant le défilement image par image (borné à la hauteur du viewport). Aucune mise en avant : les
 * autres rangées restent telles quelles.
 */
@Stable
internal class LongMessageExpansionHost(
    private val listState: LazyListState,
    private val scope: CoroutineScope,
    private val orientation: ChatListOrientation = ChatListOrientation.BottomUp,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private var state by mutableStateOf(LongMessageExpansionState())
    private var anchorJob: Job? = null

    fun isExpanded(messageId: String): Boolean = state.isExpanded(messageId)

    fun expand(messageId: String, row: LayoutCoordinates?) {
        val expansion = state.expanding(messageId) ?: return
        val edgeBefore = row?.takeIf { it.isAttached }?.let { edge(it, expansion.anchor) }
        state = expansion.state
        if (row == null || edgeBefore == null) return
        anchorJob?.cancel()
        anchorJob = scope.launch { holdEdge(row, expansion.anchor, edgeBefore, clock()) }
    }

    private suspend fun holdEdge(row: LayoutCoordinates, anchor: LongMessageExpansionLaw.Anchor, edgeBefore: Float, startMs: Long) {
        val until = startMs + ANCHOR_WINDOW_MS
        while (clock() < until && row.isAttached) {
            withFrameNanos { }
            if (!row.isAttached) return
            val viewport = listState.layoutInfo.viewportSize.height.toFloat()
            val delta = ChatScrollGeometry.anchoredScrollDelta(edgeBefore, edge(row, anchor), orientation, viewport)
            if (delta != 0f) listState.scrollBy(delta)
        }
    }

    private fun edge(row: LayoutCoordinates, anchor: LongMessageExpansionLaw.Anchor): Float {
        val top = row.positionInWindow().y
        return if (anchor == LongMessageExpansionLaw.Anchor.Top) top else top + row.size.height
    }

    private companion object {
        /** La hauteur s'anime 0,3 s : on garde le bord un peu au-delà pour absorber la dernière image. */
        const val ANCHOR_WINDOW_MS = 400L
    }
}

@Composable
internal fun rememberLongMessageExpansionHost(listState: LazyListState): LongMessageExpansionHost {
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    return remember(listState) { LongMessageExpansionHost(listState, scope) }
}

/** La cellule d'un message du fil : fournit à la rangée plate son [FlatRowExpansion]. */
@Composable
internal fun LongMessageExpansionRow(
    messageId: String,
    host: LongMessageExpansionHost,
    content: @Composable () -> Unit,
) {
    val holder = remember { arrayOfNulls<LayoutCoordinates>(1) }
    val expanded = host.isExpanded(messageId)
    val expansion = remember(messageId, expanded, host) {
        FlatRowExpansion(isExpanded = expanded, onToggle = { host.expand(messageId, holder[0]) })
    }
    Box(modifier = Modifier.onGloballyPositioned { holder[0] = it }) {
        CompositionLocalProvider(LocalFlatRowExpansion provides expansion, content = content)
    }
}
