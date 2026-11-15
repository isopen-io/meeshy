package me.meeshy.ui.component.bubble

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.RetryBarPhase
import me.meeshy.sdk.model.RetryBarState
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.R

/**
 * Bande orange du bord côté écran d'un envoi échoué (iOS `BubbleFailedRetryBar`) : fixe avec un
 * glyphe de rafraîchissement, au toucher spinner blanc et clignotement doux (fixe sous Réduire
 * les animations). Toute la hauteur est la cible (>= 48 dp de large) ; son clic, plus profond que
 * l'appui long de la bulle, l'emporte. Un échec qui se retire (lieu, média perdu) garde la croix.
 */
@Composable
internal fun BubbleFailedRetryBar(
    failure: BubbleFailure,
    onRetry: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    var state by remember { mutableStateOf(RetryBarState.forStatus(isFailed = true)) }
    val reduceMotion = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val label = BubbleFailedTap.label(failure)
    val retrying = !failure.removes && state.phase == RetryBarPhase.Retrying
    val sendingText = stringResource(R.string.bubble_retry_sending)

    val blink = state.blinks(reduceMotion) && !failure.removes
    val opacity = if (blink) {
        val transition = rememberInfiniteTransition(label = "retry-blink")
        val value by transition.animateFloat(
            initialValue = RetryBarState.REST_OPACITY,
            targetValue = RetryBarState.BLINK_OPACITY,
            animationSpec = infiniteRepeatable(tween(RetryBarState.BLINK_MILLIS), RepeatMode.Reverse),
            label = "retry-blink-alpha",
        )
        value
    } else {
        RetryBarState.REST_OPACITY
    }

    Box(
        contentAlignment = Alignment.CenterEnd,
        modifier = modifier
            .width(RetryBarState.MIN_TARGET_DP.dp)
            .fillMaxHeight()
            .let { base ->
                if (onRetry == null) base
                else base.clickable(onClickLabel = label) {
                    if (failure.removes) {
                        onRetry()
                    } else if (state.phase == RetryBarPhase.Rest) {
                        haptics.light()
                        state = state.onTap()
                        onRetry()
                    }
                }
            }
            .semantics {
                role = Role.Button
                contentDescription = label
                if (retrying) stateDescription = sendingText
            },
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .width(RetryBarState.BAND_WIDTH_DP.dp)
                .fillMaxHeight()
                .background(MeeshyPalette.Warning)
                .alpha(opacity),
        ) {
            if (retrying) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    color = MeeshyPalette.White,
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    imageVector = BubbleFailedTap.icon(failure),
                    contentDescription = null,
                    tint = MeeshyPalette.White,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}
