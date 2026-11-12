package me.meeshy.app.calls

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallVerticalEdge
import kotlin.math.roundToInt
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The pill, ONE glass for a duo and a group. A touch that stows the chrome (G1.3, laws 11 and 17) does not swap it for a
 * second glass: the captions and a consent card never hide, so the same glass stays, loses its base row and tightens
 * around them ([CallPillText.staysWhenChromeStowed]); a pill with no text leaves by the bottom edge, its whole measured
 * height, and comes back the same way ([CallChromeFade], G1.11 and G2.8).
 */
@Composable
internal fun CallControlsBlock(
    pillText: CallPillText,
    controlsVisible: Boolean,
    onRevive: () -> Unit,
    onInteraction: (CallChromeInteraction) -> Unit,
    modifier: Modifier = Modifier,
    /** U2.9 · U2.10 : the group full screen takes the pill's room back, margin included, as the pill leaves by the bottom. */
    releasesRoom: Boolean = false,
    bottomPadding: Dp = 0.dp,
    pill: @Composable () -> Unit,
) {
    val isShown = controlsVisible || pillText.staysWhenChromeStowed
    val padding by animateDpAsState(
        if (releasesRoom) 0.dp else bottomPadding,
        tween(CallChromeStow.fadeMillis(rememberCallReduceMotion())),
        label = "callControlsBlockPadding",
    )
    Box(modifier.fillMaxWidth().padding(bottom = padding), contentAlignment = Alignment.BottomCenter) {
        CallChromeFade(
            isVisible = isShown,
            onRevive = onRevive,
            stowsToward = CallVerticalEdge.Bottom,
            edgeMargin = MeeshySpacing.xl * 2,
            releasesRoom = releasesRoom,
        ) {
            CompositionLocalProvider(LocalCallChromeInteraction provides onInteraction) { pill() }
        }
    }
}

/** The room an element takes in the layout, [room] (1 → 0) of its measured height: the content itself is never remeasured. */
internal fun Modifier.callRoom(room: State<Float>): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    layout(placeable.width, (placeable.height * room.value).roundToInt()) { placeable.place(0, 0) }
}
