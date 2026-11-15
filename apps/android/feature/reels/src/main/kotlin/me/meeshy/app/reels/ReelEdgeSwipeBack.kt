package me.meeshy.app.reels

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ReelEdgeSwipeBack
import me.meeshy.sdk.model.accessibility.ReadingDirection
import kotlin.math.roundToInt

/** Le décalage du contenu pendant le glissement depuis le bord, dans le sens de la LECTURE. */
@Stable
internal class ReelEdgeSwipeState(private val scope: CoroutineScope) {
    private val drag = Animatable(0f)

    val dragPx: Float get() = drag.value

    fun follow(px: Float) {
        scope.launch { drag.snapTo(px) }
    }

    fun settle() {
        scope.launch { drag.animateTo(0f, spring(dampingRatio = 0.85f, stiffness = 400f)) }
    }
}

@Composable
internal fun rememberReelEdgeSwipeState(): ReelEdgeSwipeState {
    val scope = rememberCoroutineScope()
    return remember(scope) { ReelEdgeSwipeState(scope) }
}

/** Le contenu suit le doigt ; en RTL le déplacement s'inverse avec le sens de lecture. */
@Composable
internal fun Modifier.reelEdgeSwipeOffset(state: ReelEdgeSwipeState): Modifier {
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    return offset { IntOffset(ReadingDirection.readingDelta(state.dragPx, isRtl).roundToInt(), 0) }
}

/**
 * La bande de retour depuis le bord de DÉBUT de lecture (iOS « retour angle gauche ») : 18 dp, qui ne
 * dispute jamais le pager vertical. Au-delà de 70 dp, le lecteur se ferme ; sinon le contenu revient.
 */
@Composable
internal fun ReelEdgeSwipeStrip(
    state: ReelEdgeSwipeState,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val closeNow = rememberUpdatedState(onClose)
    Box(
        modifier
            .width(ReelEdgeSwipeBack.ZONE_DP.dp)
            .fillMaxHeight()
            .pointerInput(isRtl) {
                var translation = 0f
                detectHorizontalDragGestures(
                    onDragStart = { translation = 0f },
                    onDragEnd = {
                        if (ReelEdgeSwipeBack.shouldClose(translation, isRtl)) closeNow.value()
                        translation = 0f
                        state.settle()
                    },
                    onDragCancel = {
                        translation = 0f
                        state.settle()
                    },
                ) { change, dragAmount ->
                    change.consume()
                    translation += dragAmount
                    state.follow(ReelEdgeSwipeBack.follow(translation, isRtl))
                }
            },
    )
}
