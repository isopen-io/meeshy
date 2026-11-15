package me.meeshy.app.chat

import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Hosts the per-message fiches in a single [ModalBottomSheet]. The reactions, languages and
 * report fiches are driven by the chat state (their content is passed through the slots); the
 * other routes are served by [extra], inert by default so an entry is only offered once a
 * renderer exists. Exactly one route is shown, whatever its origin.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MessageDetailHost(
    route: MessageDetailRoute?,
    onDismiss: (MessageDetailRoute) -> Unit,
    reactions: @Composable (MessageDetailRoute.Reactions) -> Unit,
    languages: @Composable (MessageDetailRoute.Languages) -> Unit,
    report: @Composable (MessageDetailRoute.Report) -> Unit,
    modifier: Modifier = Modifier,
    extra: @Composable (MessageDetailRoute) -> Unit = {},
    containerColor: Color = MeeshyTheme.tokens.backgroundPrimary,
) {
    val active = route ?: return
    when (active) {
        // These two fiches already own their ModalBottomSheet.
        is MessageDetailRoute.Languages -> languages(active)
        is MessageDetailRoute.Report -> report(active)
        else -> ModalBottomSheet(
            onDismissRequest = { onDismiss(active) },
            containerColor = containerColor,
            modifier = modifier,
        ) {
            when (active) {
                is MessageDetailRoute.Reactions -> reactions(active)
                else -> extra(active)
            }
        }
    }
}

/** Route opened locally (by the actions menu), surviving rotation. */
@Composable
internal fun rememberLocalDetailRoute(): LocalDetailRoute {
    var encoded by rememberSaveable { mutableStateOf<String?>(null) }
    return LocalDetailRoute(
        current = MessageDetailRoute.decode(encoded),
        open = { encoded = MessageDetailRoutes.open(MessageDetailRoute.decode(encoded), it).encode() },
        close = { encoded = MessageDetailRoutes.closeIf(MessageDetailRoute.decode(encoded), it)?.encode() },
    )
}

internal class LocalDetailRoute(
    val current: MessageDetailRoute?,
    val open: (MessageDetailRoute) -> Unit,
    val close: (MessageDetailRoute) -> Unit,
)
