package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavHostController
import me.meeshy.app.feed.MoodBubble
import me.meeshy.app.feed.MoodBubbleModel
import me.meeshy.app.feed.StatusComposerDraft
import me.meeshy.app.feed.StatusComposerSheet
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.sdk.model.StatusEntry

/**
 * LA bulle d'humeur d'un autre (iOS `StatusBubbleOverlay`, #13662) — réagir, republier, répondre — et le
 * composeur d'une republication. Hébergée par le rail de stories ET par l'avatar d'une ligne de
 * conversation (#15989) : une seule bulle, deux portes.
 */
@Composable
internal fun MoodBubbleHost(
    shown: StatusEntry?,
    myUserId: String?,
    navController: NavHostController,
    statusesViewModel: StatusesViewModel,
    onDismiss: () -> Unit,
) {
    var republishSeed by remember { mutableStateOf<StatusComposerDraft?>(null) }
    if (shown != null) {
        MoodBubble(
            model = MoodBubbleModel.of(shown, myUserId),
            onReact = { emoji ->
                statusesViewModel.react(shown.id, emoji)
                onDismiss()
            },
            onRepublish = {
                onDismiss()
                republishSeed = StatusComposerDraft.republish(shown)
            },
            onReply = {
                onDismiss()
                navController.navigate(Routes.moodSpotlight(shown.id))
            },
            onDismiss = onDismiss,
            onDwellEnd = statusesViewModel::endStatusDwell,
        )
    }

    republishSeed?.let { seed ->
        StatusComposerSheet(
            initialDraft = seed,
            onPublish = { request ->
                statusesViewModel.setStatus(
                    emoji = request.emoji,
                    content = request.content,
                    visibility = request.visibility,
                    audioUrl = request.audioUrl,
                    repostOfId = request.repostOfId,
                    viaUsername = request.viaUsername,
                    visibilityUserIds = request.visibilityUserIds,
                    mentions = request.mentions,
                )
                republishSeed = null
            },
            onDismiss = { republishSeed = null },
        )
    }
}
