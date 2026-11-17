package me.meeshy.sdk.profile

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
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.conversation.CachedMessageUpdater
import me.meeshy.sdk.conversation.ParticipantCacheRepository
import me.meeshy.sdk.conversation.SenderRepaint
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.profile.OwnProfileSync
import me.meeshy.sdk.model.profile.ProfileUpdatedEvent
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/** What shows ME besides the session: the rosters I am in, the messages I sent, the conversations naming me. */
internal fun interface OwnIdentityRepaint {
    suspend fun repaint(event: UserUpdatedEvent)
}

/**
 * #18924 — `profile:updated` on my account: what I change on one device (languages, name, picture, banner) shows at once
 * on the others. The session publishes the snapshot first — the Prisme reads its languages from it — then the caches that
 * show me repaint, since `user:updated` goes to my partners and excludes me. A snapshot the session sets aside (another
 * account's, or older than the identity held) changes nothing, the caches included: they follow the session's arbitration.
 */
@Singleton
class OwnProfileSocketBinding internal constructor(
    private val events: Flow<ProfileUpdatedEvent>,
    private val session: SessionRepository,
    private val repaint: OwnIdentityRepaint,
    private val io: CoroutineDispatcher,
) : RealtimeBinding {

    @Inject
    constructor(
        messages: MessageSocketManager,
        session: SessionRepository,
        rosters: ParticipantCacheRepository,
        database: MeeshyDatabase,
        fence: AccountFence,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(messages.profileUpdated, session, mine(rosters, SenderRepaint(database, CachedMessageUpdater(database, database.messageDao(), fence))), io)

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch {
            events.collect { event ->
                try {
                    if (session.applyOwnProfile(event)) repaint.repaint(OwnProfileSync.asUserUpdated(event))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Timber.e(e, "Profil temps réel en échec")
                }
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    private companion object {
        fun mine(rosters: ParticipantCacheRepository, senders: SenderRepaint) = OwnIdentityRepaint { event ->
            rosters.repaint(event)
            senders.repaint(event)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class OwnProfileRealtimeModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: OwnProfileSocketBinding): RealtimeBinding
}
