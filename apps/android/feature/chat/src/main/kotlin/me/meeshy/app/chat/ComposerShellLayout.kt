package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.getBottom
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerBottomClearance
import me.meeshy.sdk.model.composer.ComposerMinimizeLaw
import me.meeshy.sdk.model.composer.ComposerMinimizeOutcome
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyMotion

/**
 * L'enveloppe de la barre : transparente (aucun fond propre), avec le dégagement bas calculé selon
 * le clavier, les barres système et le multi-fenêtre ([ComposerBottomClearance] : max, jamais une
 * somme), et le repli/dépli animé (échelle 0,6 + fondu, ressort 0,3/0,8 ; fondu seul en mouvement
 * réduit). Un glissement vers le bas suit le doigt avec résistance 0,5 ([ComposerMinimizeLaw]).
 */
@Composable
internal fun ComposerShellLayout(
    minimized: Boolean,
    canMinimize: Boolean,
    onMinimizeOutcome: (ComposerMinimizeOutcome) -> Unit,
    minimizedContent: @Composable () -> Unit,
    expandedContent: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val reduceMotion = LocalReduceMotion.current
    val imeShown = WindowInsets.ime.getBottom(density) > 0
    val safeBottomDp = with(density) { WindowInsets.navigationBars.getBottom(this).toDp().value }
    val clearance = if (imeShown) 0f else ComposerBottomClearance.required(safeBottomDp)
    var dragDp by remember { mutableFloatStateOf(0f) }
    val move = spring<Float>(dampingRatio = 0.8f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f))
    val enter = if (reduceMotion) fadeIn() else scaleIn(initialScale = 0.6f, animationSpec = move) + fadeIn()
    val exit = if (reduceMotion) fadeOut() else scaleOut(targetScale = 0.6f, animationSpec = move) + fadeOut()
    val dragState = rememberDraggableState { deltaPx ->
        dragDp = (dragDp + deltaPx / density.density).coerceAtLeast(0f)
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .imePadding()
            .padding(bottom = clearance.dp),
        contentAlignment = Alignment.BottomEnd,
    ) {
        AnimatedVisibility(visible = minimized, enter = enter, exit = exit) { minimizedContent() }
        AnimatedVisibility(
            visible = !minimized,
            enter = enter,
            exit = exit,
            modifier = Modifier
                .graphicsLayer { translationY = ComposerMinimizeLaw.offsetFor(dragDp) * density.density }
                .draggable(
                    state = dragState,
                    orientation = Orientation.Vertical,
                    onDragStopped = { velocityPxPerSecond ->
                        val outcome = ComposerMinimizeLaw.decide(
                            translationDp = dragDp,
                            velocityDpPerSecond = velocityPxPerSecond / density.density,
                            canMinimize = canMinimize,
                        )
                        dragDp = 0f
                        onMinimizeOutcome(outcome)
                    },
                ),
        ) { expandedContent() }
    }
}
