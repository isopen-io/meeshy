package me.meeshy.ui.component

import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import me.meeshy.ui.theme.MeeshySpacing

/** One local-action outcome to toast: a localised message and its severity. */
public data class FeedbackToastRequest(@StringRes val messageRes: Int, val kind: FeedbackKind)

/**
 * Presents a stream of [FeedbackToastRequest] as the iOS `FeedbackToastManager` does: one
 * glass pill at a time at the bottom of the screen, announced politely to screen readers,
 * shown for [displayMillis] and then slid away before the next one.
 */
@Composable
public fun FeedbackToastHost(
    toasts: Flow<FeedbackToastRequest>,
    modifier: Modifier = Modifier,
    displayMillis: Long = FEEDBACK_TOAST_DISPLAY_MS,
) {
    var current by remember { mutableStateOf<FeedbackToastRequest?>(null) }
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(toasts) {
        toasts.collect { next ->
            current = next
            visible = true
            delay(displayMillis)
            visible = false
            delay(FEEDBACK_TOAST_EXIT_MS)
        }
    }
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(
            visible = visible,
            modifier = Modifier
                .padding(MeeshySpacing.lg)
                .semantics { liveRegion = LiveRegionMode.Polite },
            enter = fadeIn() + slideInVertically { it },
            exit = fadeOut() + slideOutVertically { it },
        ) {
            current?.let { MeeshyFeedbackToast(message = stringResource(it.messageRes), kind = it.kind) }
        }
    }
}

private const val FEEDBACK_TOAST_DISPLAY_MS = 2_500L
private const val FEEDBACK_TOAST_EXIT_MS = 300L
