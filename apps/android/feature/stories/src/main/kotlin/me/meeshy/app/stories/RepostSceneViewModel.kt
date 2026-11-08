package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.storyAccentHexOf
import javax.inject.Inject

/**
 * Projette la story citée d'un repost du fil en slide, par [StorySlideProjector] — la projection du lecteur de
 * stories et du lecteur de réels —, la couleur de son auteur et le prisme du compte courant. Sans état : le fil le consulte, il n'observe rien.
 */
@HiltViewModel
class RepostSceneViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    internal fun slideOf(item: StoryItem, accentHex: String): StorySlideView =
        StorySlideProjector(config.apiBaseUrl).project(item, accentHex, sessionRepository.currentUser.value ?: NoContentPreferences)

    /**
     * La story reposté, lue sur le fond du lecteur de stories : sans fond déclaré, le dégradé que la barre des stories donne à
     * son auteur ([storyAccentHexOf]), d'après le libellé « nom affiché puis pseudo » que la carte reçoit.
     */
    internal fun repostSlideOf(item: StoryItem, authorName: String?): StorySlideView = slideOf(item, storyAccentHexOf(authorName))
}
