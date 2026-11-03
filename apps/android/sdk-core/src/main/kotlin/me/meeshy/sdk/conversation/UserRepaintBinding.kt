package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Applique `user:updated` au cache des rosters, aux messages (expéditeur, citations, transferts) et aux conversations même quand aucun écran n'est ouvert : le renommage
 * ou la nouvelle photo d'un pair est déjà là à l'ouverture suivante, sans relecture.
 */
@Singleton
class UserRepaintBinding internal constructor(
    private val socket: MessageSocketManager,
    private val rosters: ParticipantCacheRepository,
    private val senders: SenderRepaint,
) : RealtimeBinding {
    @Inject
    constructor(
        socket: MessageSocketManager,
        rosters: ParticipantCacheRepository,
        database: MeeshyDatabase,
        fence: AccountFence,
    ) : this(socket, rosters, SenderRepaint(database, CachedMessageUpdater(database, database.messageDao(), fence)))

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            socket.userUpdated.collect { event ->
                try {
                    rosters.repaint(event)
                    senders.repaint(event)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "user:updated: repeinture du cache en échec")
                }
            }
        }
    }

    override fun detach() {
        job?.cancel()
        job = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface UserRepaintModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: UserRepaintBinding): RealtimeBinding
}
