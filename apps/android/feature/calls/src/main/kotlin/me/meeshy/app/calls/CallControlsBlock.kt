package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallPillText

/**
 * The pill and, when a touch stows it, the glass of the captions that stays where it stood (#17343, law 11): the captions
 * and a consent card never hide, so a stowed pill leaves them in a glass without its base row. One place for a duo and a
 * group. The pill fades with the chrome ([CallChromeFade]); the stowed captions fade in as it leaves, over its place.
 */
@Composable
internal fun CallControlsBlock(
    pillText: CallPillText,
    controlsVisible: Boolean,
    onRevive: () -> Unit,
    onInteraction: (CallChromeInteraction) -> Unit,
    stowedCaptions: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    pill: @Composable () -> Unit,
) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
        CallChromeFade(isVisible = controlsVisible, onRevive = onRevive) {
            CompositionLocalProvider(LocalCallChromeInteraction provides onInteraction) { pill() }
        }
        AnimatedVisibility(
            visible = pillText == CallPillText.CaptionsAlone,
            enter = fadeIn(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
            exit = fadeOut(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
        ) { stowedCaptions() }
    }
}
