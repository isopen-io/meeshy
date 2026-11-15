package me.meeshy.sdk.conversation

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.MessageViewsReadStatusRules
import me.meeshy.sdk.model.ReadStatusData
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/** Source des `read-status:updated` vivants (liée au socket par Hilt). */
fun interface ReadStatusEvents {
    fun updates(): Flow<ReadStatusUpdatedEvent>
}

/** Pourquoi `GET /messages/:id/read-status` n'a rien rendu. */
enum class ReadStatusLoadFailure { Server, Connection }

/** Instantané rendu à la fiche : données (même périmées), chargement, échec. */
data class ReadStatusState(
    val data: ReadStatusData? = null,
    val isLoading: Boolean = false,
    val failure: ReadStatusLoadFailure? = null,
    val syncedAtMillis: Long? = null,
) {
    /** Le spinner n'appartient qu'au démarrage à froid. */
    val showsSpinner: Boolean
        get() = MessageViewsReadStatusRules.showsSpinner(isLoading, hasExisting = data != null)

    /** « Impossible de charger les données » + réessai : seulement si rien n'est affiché. */
    val showsError: Boolean get() = failure != null && data == null

    /** Échec d'un rechargement : les données restent, l'erreur est discrète. */
    val hasStaleError: Boolean get() = failure != null && data != null
}

/**
 * Dépôt SWR du statut de lecture : le cache est servi tout de suite, rechargé
 * en silence ; un `read-status:updated` de la conversation recharge de force
 * sans effacer l'affichage ; une erreur conserve les données existantes.
 */
@Singleton
class ReadStatusRepository(
    private val api: MessageApi,
    private val events: ReadStatusEvents,
    private val clock: CacheClock,
    private val freshForMillis: Long,
) {
    @Inject
    constructor(api: MessageApi, events: ReadStatusEvents) :
        this(api, events, SystemCacheClock, FRESH_FOR_MILLIS)

    private val states = ConcurrentHashMap<String, MutableStateFlow<ReadStatusState>>()

    private fun stateOf(messageId: String): MutableStateFlow<ReadStatusState> =
        states.getOrPut(messageId) { MutableStateFlow(ReadStatusState()) }

    fun observe(messageId: String, conversationId: String): Flow<ReadStatusState> = channelFlow {
        val state = stateOf(messageId)
        val current = state.value
        val age = current.syncedAtMillis?.let { clock.nowMillis() - it }
        val needsRevalidation = current.data == null || age == null || age > freshForMillis
        launch { state.collect { send(it) } }
        launch {
            try {
                events.updates().filter { it.conversationId == conversationId }
                    .collect { refresh(messageId, force = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (ignored: Throwable) {
            }
        }
        if (needsRevalidation) launch { refresh(messageId, force = current.data != null) }
        awaitClose { }
    }

    /** Réessai manuel de la fiche : recharge de force. */
    suspend fun retry(messageId: String) = refresh(messageId, force = true)

    internal suspend fun refresh(messageId: String, force: Boolean) {
        val state = stateOf(messageId)
        var started = false
        state.update { s ->
            val go = MessageViewsReadStatusRules.shouldFetch(
                hasExisting = s.data != null,
                isLoading = s.isLoading,
                force = force,
                hasServerId = messageId.isNotBlank(),
            )
            started = go
            if (go) s.copy(isLoading = true, failure = null) else s
        }
        if (!started) return
        when (val result = apiCall { api.readStatus(messageId) }) {
            is NetworkResult.Success -> state.update {
                ReadStatusState(data = result.data, syncedAtMillis = clock.nowMillis())
            }
            is NetworkResult.Failure -> state.update {
                val code = result.error.code
                val failure = if (code == "NETWORK" || code == "PARSE") ReadStatusLoadFailure.Connection
                else ReadStatusLoadFailure.Server
                it.copy(isLoading = false, failure = failure)
            }
        }
    }

    companion object {
        const val FRESH_FOR_MILLIS: Long = 30_000L
    }
}
