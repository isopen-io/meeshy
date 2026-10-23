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
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Applique `message:edited` (le message ENTIER, modifié sur place par la passerelle : un texte
 * corrigé, une notice d'appel « en cours » devenue « manqué » ou « terminé ») au cache Room,
 * qu'un fil soit ouvert ou non. Le rafraîchissement par filigrane ne relit jamais un message
 * dont la date de création n'a pas bougé : sans ce branchement, la copie locale resterait
 * l'ancienne, fil ouvert comme fil rouvert.
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
            socket.messageEdited.collect { message ->
                try {
                    messages.applyServerEdit(message)
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
