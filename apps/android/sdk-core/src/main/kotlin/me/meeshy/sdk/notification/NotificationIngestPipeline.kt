package me.meeshy.sdk.notification

import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationArrival
import me.meeshy.sdk.model.NotificationArrivalPolicy
import me.meeshy.sdk.model.NotificationReadScope
import me.meeshy.sdk.model.bornRead
import me.meeshy.sdk.model.friend.FriendshipLivePatch
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * L'UNIQUE endroit où un `notification:new` reçu en direct entre dans l'application (miroir de
 * `NotificationToastManager.handleNewNotification`, iOS) — il remplace les applications éparpillées d'un écran, du chrome
 * et du câblage d'amitié.
 *
 * - Doublon APN + socket sous 2 s : ignoré ([NotificationArrivalPolicy]).
 * - `friend_request` / `friend_accepted` : le cache d'amitié local est mis à jour et les caches d'amis persistés sont
 *   invalidés, avant même le dédoublonnage (idempotent).
 * - Conversation OUVERTE : persistée déjà LUE, marquée lue côté serveur, l'écho déclaré au registre d'auto-lecture,
 *   compteur intact.
 * - Sinon : persistée non lue (jamais de cache d'un seul élément quand la liste n'a pas été chargée), compteur +1 quelles
 *   que soient les préférences, arrivée publiée sur [arrived].
 *
 * La bannière in-app garde sa propre politique ; elle ne passe pas par ici.
 */
@Singleton
class NotificationIngestPipeline internal constructor(
    private val incoming: Flow<ApiNotification>,
    private val repository: NotificationRepository,
    private val consumption: NotificationConsumptionService,
    private val events: NotificationConsumptionEvents,
    private val api: NotificationApi,
    private val friendship: FriendshipCache,
    private val openConversationIds: () -> Set<String>,
    private val clock: CacheClock,
    private val scope: CoroutineScope,
) : RealtimeBinding {

    @Inject
    constructor(
        socket: MessageSocketManager,
        repository: NotificationRepository,
        consumption: NotificationConsumptionService,
        events: NotificationConsumptionEvents,
        api: NotificationApi,
        friendship: FriendshipCache,
        active: ActiveConversationStore,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(
        socket.notificationReceived, repository, consumption, events, api, friendship,
        { setOfNotNull(active.conversationId.value) }, SystemCacheClock, CoroutineScope(SupervisorJob() + io),
    )

    private val lock = Any()
    private var policy = NotificationArrivalPolicy.empty()
    private var job: Job? = null

    private val _arrived = MutableSharedFlow<ApiNotification>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** Les notifications ENTRÉES non lues (pas les doublons, pas celles nées lues) : de quoi signaler sans re-décider. */
    val arrived: SharedFlow<ApiNotification> = _arrived.asSharedFlow()

    override fun attach() {
        detach()
        job = scope.launch {
            incoming.collect { notification ->
                try {
                    ingest(notification)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.e(failure, "Arrivée de notification en échec")
                }
            }
        }
    }

    override fun detach() {
        job?.cancel()
        job = null
    }

    /** Point d'entrée unique : le socket aujourd'hui, un push de premier plan demain. */
    fun ingest(received: ApiNotification) {
        val notification = received.withCreatedAt()
        val arrival = synchronized(lock) {
            val outcome = policy.admit(notification, openConversationIds(), clock.nowMillis())
            policy = outcome.policy
            outcome.arrival
        }
        if (arrival != NotificationArrival.ConsumedOnArrival) applyFriendship(notification)
        when (arrival) {
            NotificationArrival.Duplicate -> Unit
            NotificationArrival.ConsumedOnArrival -> consumeOnArrival(notification)
            NotificationArrival.Unread -> {
                repository.prependLive(notification)
                _arrived.tryEmit(notification)
            }
        }
    }

    private fun consumeOnArrival(notification: ApiNotification) {
        repository.prependLive(notification.bornRead())
        consumption.declareSelfRead(notification.id)
        events.publishRead(NotificationReadScope.Single(notification.id))
        scope.launch {
            val result = try {
                apiCall { api.markAsRead(notification.id) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.w("Marquage lu à l'arrivée en échec (%s)", failure.javaClass.simpleName)
                consumption.retractSelfRead(notification.id)
                return@launch
            }
            if (result is NetworkResult.Failure) {
                Timber.w("Marquage lu à l'arrivée refusé (%s)", result.error.code)
                consumption.retractSelfRead(notification.id)
            }
        }
    }

    private fun applyFriendship(notification: ApiNotification) {
        when (val patch = FriendshipLivePatch.from(notification)) {
            is FriendshipLivePatch.Received -> friendship.didReceiveRequest(patch.senderId, patch.requestId)
            is FriendshipLivePatch.Accepted -> friendship.didAcceptRequest(patch.accepterId)
            null -> return
        }
        scope.launch {
            try {
                friendship.invalidatePersistedFriendCaches()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.w("Invalidation des caches d'amis en échec (%s)", failure.javaClass.simpleName)
            }
        }
    }

    private fun ApiNotification.withCreatedAt(): ApiNotification =
        if (state.createdAt.isNotBlank()) this
        else copy(state = state.copy(createdAt = Instant.ofEpochMilli(clock.nowMillis()).toString()))
}
