package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import me.meeshy.app.feed.MoodLookup
import me.meeshy.app.feed.MoodQueuedToast
import me.meeshy.app.feed.MoodReactFailureToast
import me.meeshy.app.feed.MoodRepostRefusedToast
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.app.stories.StoriesViewModel
import me.meeshy.app.stories.StoryTray
import me.meeshy.sdk.model.composer.ComposerOrigin

/**
 * LE rail de stories de l'application — iOS `StoryTrayView`, monté à l'identique en tête du fil et de la
 * liste des conversations (#13653). Les deux écrans l'appellent ; aucun ne câble son propre rail, et
 * l'humeur (statut) y vit sur l'avatar, comme `MyStoryButton` / `StoryRingCell` d'iOS : appui sur
 * l'humeur d'un autre = sa bulle (réagir, republier, répondre — iOS `StatusBubbleOverlay`, #13662),
 * appui sur la sienne = le composeur d'humeur. Chaque apparition d'une humeur sur le rail compte une impression
 * (status / story_rail), une réaction refusée se dit par un toast.
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
    var bubbleUserId by rememberSaveable { mutableStateOf<String?>(null) }

    StoryTray(
        modifier = modifier,
        onOpenStory = { userId -> navController.navigate(Routes.story(userId)) },
        onAddStory = { navController.navigate(storyDoor) },
        onManageStories = { navController.navigate(Routes.MY_STORIES) },
        onEditStory = { storyId -> navController.navigate(Routes.storyComposerEdit(storyId)) },
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
        moodIdOf = moods::statusIdOf,
        onMoodShown = statusesViewModel::trackImpression,
        viewModel = storiesViewModel,
    )
    MoodReactFailureToast(statusesViewModel.reactFailed)
    MoodRepostRefusedToast(statusesViewModel.repostAudienceRefused)
    MoodQueuedToast(statusesViewModel.moodQueued)

    MoodBubbleHost(
        shown = bubbleUserId?.let(moods::entryOf),
        myUserId = statuses.myStatus?.userId,
        navController = navController,
        statusesViewModel = statusesViewModel,
        onDismiss = { bubbleUserId = null },
    )
}
