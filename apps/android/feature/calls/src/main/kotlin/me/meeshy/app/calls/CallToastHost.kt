package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.ui.component.MeeshyFeedbackToast
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The host of the [CallToastBus] on the call screen: one feedback toast at a time,
 * each shown for [displayMillis] then slid away before the next one comes in, so
 * a burst reads as a sequence rather than a flicker. A toast posted while the
 * host was not composed is already waiting in the bus and appears on arrival.
 *
 * The container is a polite live region: a screen-reader user hears the outcome
 * of what they just did without losing focus. Colour never carries the meaning
 * alone — the severity icon and the text do.
 *
 * Law 17.10: it comes down from the top edge and goes back up there; under
 * « Reduce animations » ([rememberCallReduceMotion]) it only fades, shortly
 * ([CallChromeStow.fadeMillis]) — no displacement.
 */
@Composable
fun CallToastHost(
    toasts: Flow<CallToast>,
    modifier: Modifier = Modifier,
    displayMillis: Long = TOAST_DISPLAY_MS,
) {
    var current by remember { mutableStateOf<CallToast?>(null) }
    var visible by remember { mutableStateOf(false) }
    val reduceMotion = rememberCallReduceMotion()
    val millis = CallChromeStow.fadeMillis(reduceMotion)
    val slides = CallChromeStow.leavesByItsEdge(isVisible = false, reduceMotion = reduceMotion)

    LaunchedEffect(toasts) {
        toasts.collect { next ->
            current = next
            visible = true
            delay(displayMillis)
            visible = false
            delay(TOAST_EXIT_MS)
        }
    }

    AnimatedVisibility(
        visible = visible,
        modifier = modifier
            .padding(horizontal = MeeshySpacing.lg)
            .semantics { liveRegion = LiveRegionMode.Polite },
        enter = fadeIn(tween(millis)) + if (slides) slideInVertically(tween(millis)) { -it } else EnterTransition.None,
        exit = fadeOut(tween(millis)) + if (slides) slideOutVertically(tween(millis)) { -it } else ExitTransition.None,
    ) {
        current?.let { toast -> MeeshyFeedbackToast(
            message = toast.message,
            kind = toast.kind,
            modifier = toast.onTap?.let { Modifier.clickable(onClick = it) } ?: Modifier,
        ) }
    }
}

private const val TOAST_DISPLAY_MS = 2_500L
private const val TOAST_EXIT_MS = 300L
