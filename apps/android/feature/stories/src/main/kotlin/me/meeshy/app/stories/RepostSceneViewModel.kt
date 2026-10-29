package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * Projette la story citée d'un repost du fil en slide, par [StorySlideProjector] — la projection du lecteur de
 * stories et du lecteur de réels — et le prisme du compte courant. Sans état : le fil le consulte, il n'observe rien.
 */
@HiltViewModel
class RepostSceneViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    internal fun slideOf(item: StoryItem, accentHex: String): StorySlideView =
        StorySlideProjector(config.apiBaseUrl).project(item, accentHex, sessionRepository.currentUser.value ?: NoContentPreferences)
}
