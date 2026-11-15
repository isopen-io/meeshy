package me.meeshy.app.social

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import dagger.Binds
import dagger.BindsOptionalOf
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.avatar.ComposeSeedTarget
import me.meeshy.ui.component.avatar.LocalSocialChrome
import me.meeshy.ui.component.avatar.SocialChromeEnvironment
import java.util.Optional
import javax.inject.Inject

/**
 * Les sources du chrome social : un lot propriétaire (stories, statuts, spotlight d'humeur) lie
 * UNE implémentation ; chaque capacité non fournie reste `null`. Aucune liaison = environnement absent.
 */
interface SocialChromeSources {
    fun moodEmoji(userId: String): String? = null
    fun storyRing(userId: String): StoryRingState = StoryRingState.None
    fun moodTap(userId: String): (() -> Unit)? = null
    fun openStoryViewer(userId: String) {}
    val canOpenStoryViewer: Boolean get() = false
    fun publishStory(seed: ComposeSeedTarget) {}
    val canPublishStory: Boolean get() = false
    fun openComposer(seed: ComposeSeedTarget) {}
    val canOpenComposer: Boolean get() = false
}

/** Projette [sources] en environnement ; `null` ou capacité absente = résolveur `null`, jamais un plantage. */
internal fun socialChromeEnvironment(sources: SocialChromeSources?): SocialChromeEnvironment {
    if (sources == null) return SocialChromeEnvironment.Absent
    return SocialChromeEnvironment(
        moodEmoji = sources::moodEmoji,
        storyRing = sources::storyRing,
        moodTap = sources::moodTap,
        openStoryViewer = if (sources.canOpenStoryViewer) sources::openStoryViewer else null,
        publishStory = if (sources.canPublishStory) sources::publishStory else null,
        openComposer = if (sources.canOpenComposer) sources::openComposer else null,
    )
}

/** Fournit `LocalSocialChrome` une fois à la racine ; hérité par toutes les feuilles et les feuilles modales. */
class SocialChromeProvider @Inject constructor(
    sources: Optional<@JvmSuppressWildcards SocialChromeSources>,
) : AppLocalsProvider {
    private val environment = socialChromeEnvironment(sources.orElse(null))
    override val order: Int = -50

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        val env = remember { environment }
        CompositionLocalProvider(LocalSocialChrome provides env, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class SocialChromeModule {
    @Binds
    @IntoSet
    abstract fun bindSocialChromeProvider(provider: SocialChromeProvider): AppLocalsProvider

    @BindsOptionalOf
    abstract fun optionalSocialChromeSources(): SocialChromeSources
}
