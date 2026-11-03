package me.meeshy.sdk.engagement

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocialSocketManager
import timber.log.Timber

/**
 * Branche `engagement:conversation-updated` et `engagement:post-updated` sur leurs magasins pour toute la
 * durée de la session : la marque de ligne de liste et les points d'un post restent à jour hors écran.
 */
@Singleton
class EngagementPointsBinding @Inject constructor(
    private val conversationEvents: ConversationSocketEventsManager,
    private val social: SocialSocketManager,
    private val conversations: ConversationEngagementStore,
    private val posts: PostViewerPointsStore,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        guarded(live, conversationEvents.events.filterIsInstance<ConversationEngagementSnapshot>()) { conversations.seed(it) }
        guarded(live, social.postEngagementUpdated) { posts.noteAnnouncement(it) }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    private fun <T> guarded(live: CoroutineScope, flow: Flow<T>, handle: (T) -> Unit) {
        flow.onEach {
            try {
                handle(it)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.e(e, "Annonce d'engagement en échec")
            }
        }.launchIn(live)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class EngagementPointsModule {
    @Binds
    @IntoSet
    abstract fun realtime(binding: EngagementPointsBinding): RealtimeBinding

    @Binds
    @IntoSet
    abstract fun conversationCache(store: ConversationEngagementStore): PerAccountCache

    @Binds
    @IntoSet
    abstract fun postCache(store: PostViewerPointsStore): PerAccountCache
}
