package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.ui.theme.MeeshySpacing

private const val DOT_ALPHA_IDLE = 0.5f

/**
 * **LES DÉCLINAISONS D'UN CADRE, DANS SA VIGNETTE** (#13687, miroir de iOS `CallFrameDeclinationPager`) — sur le
 * cadre choisi, un glissé VERTICAL passe d'une déclinaison à l'autre (sa version de base, sa version « Relief »…).
 * Le pager suit le doigt et revient tant qu'il n'a pas franchi la page ; gauche/droite reste au carrousel. Des
 * points sur le bord disent combien de déclinaisons, et laquelle est posée. La page posée s'applique — et se
 * propose à l'autre, sous son identifiant décliné.
 */
@Composable
internal fun CallFrameDeclinationPager(
    declinations: List<CallFrameDesign>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    thumbnail: @Composable (CallFrameDesign) -> Unit,
) {
    val index = declinations.indexOfFirst { it.id == selected }.coerceAtLeast(0)
    val pager = rememberPagerState(initialPage = index) { declinations.size }
    val haptics = LocalHapticFeedback.current
    val select by rememberUpdatedState(onSelect)
    val current by rememberUpdatedState(selected)
    LaunchedEffect(index) {
        if (pager.currentPage != index && !pager.isScrollInProgress) pager.scrollToPage(index)
    }
    LaunchedEffect(pager, declinations) {
        snapshotFlow { pager.settledPage }.distinctUntilChanged().drop(1).collect { page ->
            val id = declinations.getOrNull(page)?.id ?: return@collect
            if (id == current) return@collect
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            select(id)
        }
    }
    val state = stringResource(R.string.call_live_frame_declination_state, index + 1, declinations.size)
    val next = stringResource(R.string.call_live_frame_declination_next)
    val previous = stringResource(R.string.call_live_frame_declination_previous)
    Box(
        modifier
            .fillMaxSize()
            .semantics {
                stateDescription = state
                customActions = listOfNotNull(
                    declinations.getOrNull(index + 1)?.let { design -> CustomAccessibilityAction(next) { select(design.id); true } },
                    declinations.getOrNull(index - 1)?.let { design -> CustomAccessibilityAction(previous) { select(design.id); true } },
                )
            },
    ) {
        VerticalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            Box(Modifier.fillMaxSize()) { thumbnail(declinations[page]) }
        }
        CallFrameDeclinationDots(declinations.size, index, Modifier.align(Alignment.CenterEnd).padding(end = MeeshySpacing.xs))
    }
}

@Composable
private fun CallFrameDeclinationDots(count: Int, index: Int, modifier: Modifier = Modifier) {
    Column(modifier.clearAndSetSemantics { }, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        repeat(count) { dot ->
            Box(
                Modifier
                    .size(4.dp)
                    .shadow(1.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = if (dot == index) 1f else DOT_ALPHA_IDLE)),
            )
        }
    }
}
