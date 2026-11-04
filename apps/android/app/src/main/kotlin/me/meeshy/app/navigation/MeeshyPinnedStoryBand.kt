package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.app.feed.MoodLookup
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.app.stories.PinnedBandSelf
import me.meeshy.app.stories.PinnedStoryTrailBand
import me.meeshy.app.stories.StoriesViewModel
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.DynamicColorGenerator

/** Le compte courant, première cellule de la bande quand il n'a aucun anneau : son avatar, jamais un « + ». */
@HiltViewModel
class PinnedBandSelfViewModel @Inject constructor(
    sessionRepository: SessionRepository,
) : ViewModel() {
    val self: StateFlow<PinnedBandSelf?> = sessionRepository.currentUser
        .map { user ->
            user?.let {
                PinnedBandSelf(
                    displayName = it.effectiveDisplayName,
                    avatarUrl = it.avatar,
                    accentHex = DynamicColorGenerator.colorForName(it.username),
                )
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

/**
 * La bande compacte qui prend la place du titre (iOS `PinnedStoryTrailBand`), montée par le fil ET la liste des
 * conversations à travers le slot d'une ligne `pinnedBand = { MeeshyPinnedStoryBand(...) }` de leurs écrans :
 * mêmes données que le grand plateau, mêmes portes (lecteur, « Mes stories », composeur).
 */
@Composable
internal fun MeeshyPinnedStoryBand(
    navController: NavHostController,
    storiesViewModel: StoriesViewModel,
    reveal: Float,
    modifier: Modifier = Modifier,
    statusesViewModel: StatusesViewModel = hiltViewModel(),
    selfViewModel: PinnedBandSelfViewModel = hiltViewModel(),
) {
    val self by selfViewModel.self.collectAsStateWithLifecycle()
    val statuses by statusesViewModel.state.collectAsStateWithLifecycle()
    val moods = remember(statuses.statuses, statuses.myStatus) { MoodLookup.from(statuses) }
    PinnedStoryTrailBand(
        reveal = reveal,
        modifier = modifier,
        self = self,
        onOpenStory = { userId -> navController.navigate(Routes.story(userId)) },
        onAddStory = { navController.navigate(storyDoor) },
        onManageStories = { navController.navigate(Routes.MY_STORIES) },
        moodEmojiOf = moods::emojiOf,
        viewModel = storiesViewModel,
    )
}
