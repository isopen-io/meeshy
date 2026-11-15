package me.meeshy.sdk.conversation

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
import me.meeshy.sdk.model.AttachmentDeletedEvent
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.collectArrived
import timber.log.Timber

/**
 * `attachment:deleted` (#13609) atteint le cache Room qu'un fil soit ouvert ou non : la pièce retirée par un membre (ou
 * par l'auteur sur un autre appareil) disparaît de la bulle et de l'aperçu de la liste. Chaque événement s'écrit sous le
 * compte auquel il est ARRIVÉ ([collectArrived]) : la socket d'un compte quitté n'écrit rien chez le suivant.
 */
@Singleton
class AttachmentDeletionBinding @Inject constructor(
    private val events: ConversationSocketEventsManager,
    private val applier: AttachmentDeletionApplier,
    @IoDispatcher io: CoroutineDispatcher,
) : RealtimeBinding {
    private val scope = CoroutineScope(SupervisorJob() + io)
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            events.events.collectArrived { event ->
                if (event !is AttachmentDeletedEvent) return@collectArrived
                try {
                    applier.apply(event)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "attachment:deleted : écriture du cache en échec")
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
internal interface AttachmentDeletionModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: AttachmentDeletionBinding): RealtimeBinding
}
