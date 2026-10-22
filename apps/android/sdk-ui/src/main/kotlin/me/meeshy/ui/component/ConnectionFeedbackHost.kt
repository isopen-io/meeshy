package me.meeshy.ui.component

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
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
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.ConnectionHaptic
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshySpacing

private const val TOAST_VISIBLE_MILLIS = 2_200L

@StringRes
internal fun ConnectionFeedback.messageRes(): Int = when (this) {
    ConnectionFeedback.RequestSent -> R.string.connection_toast_request_sent
    ConnectionFeedback.RequestSendFailed -> R.string.connection_toast_request_send_failed
    ConnectionFeedback.ConnectionAccepted -> R.string.connection_toast_connection_accepted
    ConnectionFeedback.AcceptFailed -> R.string.connection_toast_accept_failed
    ConnectionFeedback.RequestDeclined -> R.string.connection_toast_request_declined
    ConnectionFeedback.DeclineFailed -> R.string.connection_toast_decline_failed
    ConnectionFeedback.RequestCancelled -> R.string.connection_toast_request_cancelled
    ConnectionFeedback.CancelFailed -> R.string.connection_toast_cancel_failed
}

internal fun hapticConstantFor(haptic: ConnectionHaptic, sdkInt: Int = Build.VERSION.SDK_INT): Int = when (haptic) {
    ConnectionHaptic.Success ->
        if (sdkInt >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
    ConnectionHaptic.Medium -> HapticFeedbackConstants.CONTEXT_CLICK
    ConnectionHaptic.Error ->
        if (sdkInt >= Build.VERSION_CODES.R) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
}

private fun View.perform(haptic: ConnectionHaptic) {
    performHapticFeedback(hapticConstantFor(haptic))
}

/**
 * Hosts the haptic + toast feedback of [ConnectionActionChip] gestures. Mount ONE per
 * screen, over its content, fed with `ConnectionActionController.feedback` — each
 * gesture outcome (including an asynchronous queue exhaustion) shows its French/localised
 * toast and plays its haptic exactly once.
 */
@Composable
public fun ConnectionFeedbackHost(
    feedback: Flow<ConnectionFeedback>,
    modifier: Modifier = Modifier,
) {
    val view = LocalView.current
    var current by remember { mutableStateOf<ConnectionFeedback?>(null) }
    var token by remember { mutableStateOf(0) }
    LaunchedEffect(feedback) {
        feedback.collect {
            view.perform(it.haptic)
            current = it
            token += 1
        }
    }
    LaunchedEffect(token) {
        if (token == 0) return@LaunchedEffect
        delay(TOAST_VISIBLE_MILLIS)
        current = null
    }
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        val shown = current
        AnimatedVisibility(
            visible = shown != null,
            enter = fadeIn() + slideInVertically { it },
            exit = fadeOut() + slideOutVertically { it },
        ) {
            if (shown != null) {
                MeeshyFeedbackToast(
                    message = stringResource(shown.messageRes()),
                    kind = if (shown.isError) FeedbackKind.Error else FeedbackKind.Success,
                    modifier = Modifier.padding(MeeshySpacing.lg),
                )
            }
        }
    }
}
