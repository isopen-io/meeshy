package me.meeshy.app.notifications

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.ui.component.MeeshyNotificationToast

/**
 * The sender line of the in-app toast — the actor's display name, else username, else a neutral
 * brand fallback. Pure so it stays unit-testable off Compose.
 */
internal fun notificationToastSenderName(notification: ApiNotification): String =
    notification.actor?.displayName?.takeIf { it.isNotBlank() }
        ?: notification.actor?.username?.takeIf { it.isNotBlank() }
        ?: "Meeshy"

/**
 * The subtitle line — the conversation title (a message toast), else the notification content
 * (a social one), else empty. Pure so it stays unit-testable off Compose.
 */
internal fun notificationToastSubtitle(notification: ApiNotification): String =
    notification.context?.conversationTitle?.takeIf { it.isNotBlank() }
        ?: notification.content?.takeIf { it.isNotBlank() }
        ?: ""

/**
 * Mounts the in-app real-time toast: observes [NotificationToastViewModel.currentToast] and
 * renders the `MeeshyNotificationToast` atom, sliding in from the top. Tapping it deep-links via
 * [onOpen] and dismisses. Placed once at the app root (over the nav host); the ViewModel owns all
 * timing and gating, so this is pure presentation glue.
 */
@Composable
fun NotificationToastHost(
    viewModel: NotificationToastViewModel,
    modifier: Modifier = Modifier,
    onOpen: (ApiNotification) -> Unit = {},
) {
    val toast by viewModel.currentToast.collectAsStateWithLifecycle()
    // Retain the last non-null notification so the slide-out animation has content to render.
    var shown by remember { mutableStateOf<ApiNotification?>(null) }
    if (toast != null) shown = toast
    AnimatedVisibility(
        visible = toast != null,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        shown?.let { notification ->
            MeeshyNotificationToast(
                senderName = notificationToastSenderName(notification),
                title = notificationToastSubtitle(notification),
                modifier = modifier,
                avatarName = notificationToastSenderName(notification),
                onTap = {
                    onOpen(notification)
                    viewModel.dismiss()
                },
            )
        }
    }
}
