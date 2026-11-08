package me.meeshy.sdk.notification

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.NotificationReadScope
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * Ouvrir une conversation ou un post consomme ses notifications — branché sur [ActiveConversationStore], la vérité de
 * navigation, et non dans un ViewModel de chat ou de post. La cadence (cinq secondes par clé) absorbe les
 * réouvertures en rafale ; le geste local, lui, part toujours.
 */
@Singleton
class ActiveContextConsumptionBinding @Inject constructor(
    private val active: ActiveConversationStore,
    private val consumption: NotificationConsumptionService,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch {
            active.conversationId.filterNotNull().collect { id ->
                consumeSafely(NotificationReadScope.Conversation(id))
            }
        }
        live.launch {
            active.postId.filterNotNull().collect { id ->
                consumeSafely(NotificationReadScope.Post(id))
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    private suspend fun consumeSafely(target: NotificationReadScope) {
        try {
            consumption.consume(target)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Timber.e(e, "Consommation à l'ouverture en échec")
        }
    }
}
