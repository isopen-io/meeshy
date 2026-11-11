package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallVerticalEdge
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
    pill: @Composable () -> Unit,
) {
    val isShown = controlsVisible || pillText.staysWhenChromeStowed
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
        CallChromeFade(
            isVisible = isShown,
            onRevive = onRevive,
            stowsToward = CallVerticalEdge.Bottom,
            edgeMargin = MeeshySpacing.xl * 2,
        ) {
            CompositionLocalProvider(LocalCallChromeInteraction provides onInteraction) { pill() }
        }
    }
}
