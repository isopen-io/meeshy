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
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber
import javax.inject.Inject

/**
 * Applique `user:updated` au cache des rosters même quand aucun écran n'est ouvert : le renommage
 * ou la nouvelle photo d'un pair est déjà là à l'ouverture suivante, sans relecture.
 */
class UserRepaintBinding @Inject constructor(
    private val socket: MessageSocketManager,
    private val rosters: ParticipantCacheRepository,
) : RealtimeBinding {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            socket.userUpdated.collect { event ->
                try {
                    rosters.repaint(event)
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
internal abstract class UserRepaintModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: UserRepaintBinding): RealtimeBinding
}
