package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import me.meeshy.app.feed.MoodBubble
import me.meeshy.app.feed.MoodBubbleModel
import me.meeshy.app.feed.MoodLookup
import me.meeshy.app.feed.MoodRailImpressions
import me.meeshy.app.feed.StatusComposerDraft
import me.meeshy.app.feed.StatusComposerSheet
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.app.stories.StoriesViewModel
import me.meeshy.app.stories.StoryTray
import me.meeshy.sdk.model.composer.ComposerOrigin

/**
 * LE rail de stories de l'application — iOS `StoryTrayView`, monté à l'identique en tête du fil et de la
 * liste des conversations (#13653). Les deux écrans l'appellent ; aucun ne câble son propre rail, et
 * l'humeur (statut) y vit sur l'avatar, comme `MyStoryButton` / `StoryRingCell` d'iOS : appui sur
 * l'humeur d'un autre = sa bulle (réagir, republier, répondre — iOS `StatusBubbleOverlay`, #13662),
 * appui sur la sienne = le composeur d'humeur. Chaque humeur vue sur le rail compte une impression.
 */
@Composable
internal fun MeeshyStoryRail(
    navController: NavHostController,
    storiesViewModel: StoriesViewModel,
    modifier: Modifier = Modifier,
    statusesViewModel: StatusesViewModel = hiltViewModel(),
) {
    val statuses by statusesViewModel.state.collectAsStateWithLifecycle()
    val moods = remember(statuses.statuses, statuses.myStatus) { MoodLookup.from(statuses) }
    val impressions = remember { MoodRailImpressions() }
    var bubbleUserId by remember { mutableStateOf<String?>(null) }
    var republishSeed by remember { mutableStateOf<StatusComposerDraft?>(null) }

    StoryTray(
        modifier = modifier,
        onOpenStory = { userId -> navController.navigate(Routes.story(userId)) },
        onAddStory = { navController.navigate(storyDoor) },
        onManageStories = { navController.navigate(Routes.MY_STORIES) },
        onShowProfile = { userId -> navController.navigate(Routes.profile(userId)) },
        moodEmojiOf = moods::emojiOf,
        myMoodEmoji = moods.myEmoji,
        onAddStatus = { Routes.composer(ComposerOrigin.MoodChip)?.let(navController::navigate) },
        onMoodTap = { userId ->
            moods.entryOf(userId)?.let { entry ->
                bubbleUserId = userId
                statusesViewModel.markStatusViewed(entry.id)
            }
        },
        onMoodShown = { userId ->
            moods.statusIdOf(userId)?.takeIf(impressions::firstSight)?.let(statusesViewModel::trackImpression)
        },
        viewModel = storiesViewModel,
    )

    val shown = bubbleUserId?.let(moods::entryOf)
    if (shown != null) {
        MoodBubble(
            model = MoodBubbleModel.of(shown, statuses.myStatus?.userId),
            onReact = { emoji ->
                statusesViewModel.react(shown.id, emoji)
                bubbleUserId = null
            },
            onRepublish = {
                bubbleUserId = null
                republishSeed = StatusComposerDraft.republish(shown)
            },
            onReply = {
                bubbleUserId = null
                navController.navigate(Routes.moodSpotlight(shown.id))
            },
            onDismiss = { bubbleUserId = null },
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
                )
                republishSeed = null
            },
            onDismiss = { republishSeed = null },
        )
    }
}
