package me.meeshy.sdk.packs

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
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/** Branche `pack:installation-updated` sur mon compte : un pack acheté ou retiré ici ou ailleurs se voit aussitôt. */
@Singleton
class PackInstallationSocketBinding @Inject constructor(
    private val messages: MessageSocketManager,
    private val repository: PackShopRepository,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch {
            try {
                messages.packInstallationUpdated.collect { event ->
                    try {
                        repository.onInstallationUpdated(event, repository.installationTicket())
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Timber.e(e, "Installation de pack temps réel en échec")
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.e(e, "Installation de pack temps réel en échec")
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class PackInstallationRealtimeModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: PackInstallationSocketBinding): RealtimeBinding
}
