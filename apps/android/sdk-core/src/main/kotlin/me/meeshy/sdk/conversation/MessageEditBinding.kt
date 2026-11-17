package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.sync.MessageMutationApplier
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.collectArrived
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Applique `message:edited` (le message ENTIER, modifié sur place par la passerelle : un texte
 * corrigé, une notice d'appel « en cours » devenue « manqué » ou « terminé ») au cache Room,
 * qu'un fil soit ouvert ou non. Une revalidation ne relit que la fenêtre récente (#18915) : au-delà
 * d'elle, et entre deux revalidations, seul ce branchement porte la modification jusqu'à la ligne —
 * sans lui, la copie locale resterait l'ancienne.
 */
@Singleton
class MessageEditBinding @Inject constructor(
    private val socket: MessageSocketManager,
    private val messages: MessageRepository,
    @IoDispatcher io: CoroutineDispatcher,
) : RealtimeBinding {
    private val scope = CoroutineScope(SupervisorJob() + io)
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            socket.messageEdited.collectArrived { message ->
                try {
                    messages.applyServerEdit(MessageMutationApplier.normalizedEdit(message))
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "message:edited : écriture du cache en échec")
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
internal interface MessageEditModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: MessageEditBinding): RealtimeBinding
}
