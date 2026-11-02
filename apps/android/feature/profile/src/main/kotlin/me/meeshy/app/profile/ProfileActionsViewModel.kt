package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectOpenResult
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.ConnectionActionController
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.UserRelationshipResolver
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.model.profile.ProfileActionPlan
import me.meeshy.sdk.model.profile.ProfileCallRequest
import me.meeshy.sdk.model.profile.ProfileConnection
import me.meeshy.sdk.model.relation.ProfileCircle
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.relation.CirclesGateway
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class ProfileActionsState(
    val userId: String? = null,
    val plan: ProfileActionPlan? = null,
    val render: ConnectionActionRender = ConnectionActionRender.Hidden,
    val isOpeningConversation: Boolean = false,
    /** Le cercle commun servi (#13940) ; `null` sans lien servi : la fiche garde « Connectés ». */
    val circle: ProfileCircle? = null,
)

/** Outcome of a profile gesture that is not a connection gesture (those come from the shared controller). */
enum class ProfileActionFeedback(val isError: Boolean) {
    UserBlocked(false),
    BlockFailed(true),
    UserUnblocked(false),
    UnblockFailed(true),
    OpenConversationFailed(true),
    CallNotPlaced(true),

    /** La demande d'un cran du cercle (#13940) est partie, ou la file y a renoncé. */
    RaiseSent(false),
    RaiseFailed(true),
}

sealed interface ProfileActionEvent {
    data class OpenConversation(val conversationId: String) : ProfileActionEvent
    data class Toast(val feedback: ProfileActionFeedback) : ProfileActionEvent
    data class Call(val request: ProfileCallRequest) : ProfileActionEvent
}

/**
 * The actions of someone else's profile — port of the iOS `UserProfileSheet` action half:
 * « Envoyer un message », the connection request / cancel / resend / accept / decline, and
 * block / unblock. What is offered is the pure [ProfileActionPlan]; the relation is read live
 * from the shared [FriendshipCache] and [BlockCache], so a gesture made anywhere else in the
 * app re-renders this profile too. Connection gestures go through the one
 * [ConnectionActionController] (optimistic + outbox, same toasts as the Contacts screens).
 */
@HiltViewModel
class ProfileActionsViewModel @Inject constructor(
    private val connection: ConnectionActionController,
    private val friendshipCache: FriendshipCache,
    private val blockCache: BlockCache,
    private val blockRepository: BlockRepository,
    private val directConversationOpener: DirectConversationOpener,
    private val workManager: WorkManager,
    private val sessionRepository: SessionRepository,
    private val circles: CirclesGateway,
) : ViewModel() {

    private val resolver = UserRelationshipResolver.wiredTo(
        friendshipCache = friendshipCache,
        blockCache = blockCache,
        currentUserId = { sessionRepository.currentUserId },
    )

    private val target = MutableStateFlow<Target?>(null)

    private val _state = MutableStateFlow(ProfileActionsState())
    val state: StateFlow<ProfileActionsState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<ProfileActionEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<ProfileActionEvent> = _events.asSharedFlow()

    val connectionFeedback: SharedFlow<ConnectionFeedback> get() = connection.feedback

    private val raiseCmids = mutableMapOf<String, String>()
    private var circleJob: Job? = null

    init {
        viewModelScope.launch {
            combine(target, friendshipCache.version, blockCache.version) { bound, _, _ -> bound }
                .collect { bound -> bound?.let(::rederive) }
        }
        viewModelScope.launch { circles.exhausted.collect { receiveExhausted(it) } }
    }

    /** Points the actions at the resolved person; idempotent for the same id. */
    fun bind(userId: String, isAnonymous: Boolean, callsAvailable: Boolean = false) {
        if (userId.isBlank()) return
        val next = Target(userId, isAnonymous, callsAvailable)
        if (target.value == next) return
        target.value = next
        rederive(next)
        if (blockCache.blockedCount == 0) refreshBlocklist()
        if (!isAnonymous) loadCircle(userId)
    }

    /**
     * Le cercle commun, cache d'abord (le même disque que « Mes cercles »), puis `GET /relations` ; enfin le cran que je lui
     * ai déjà demandé. Une panne garde ce qui est peint ; rien n'est inventé.
     */
    private fun loadCircle(userId: String) {
        circleJob?.cancel()
        circleJob = viewModelScope.launch {
            val cached = quietly { circles.cachedLinks() }.orEmpty()
            applyCircle(userId, ProfileCircle.of(userId, cached, emptyList()))
            val served = (quietly { circles.refreshLinks() } as? NetworkResult.Success)?.data ?: cached
            val sent = quietly { circles.pendingRequests(FriendRequestDirection.Sent) }.orEmpty()
            val pendingNow = _state.value.circle?.pending
            val fresh = ProfileCircle.of(userId, served, sent)
            applyCircle(userId, fresh?.copy(pending = fresh.pending ?: pendingNow))
        }
    }

    private fun applyCircle(userId: String, circle: ProfileCircle?) {
        if (target.value?.userId != userId) return
        _state.update { it.copy(circle = circle) }
    }

    /** Instantané → local → file durable → retour arrière si la file y renonce (iso `ProfileCircleViewModel.requestRaise`). */
    fun requestRaise() = withTarget { id ->
        val circle = _state.value.circle ?: return@withTarget
        val raise = circle.offeredRaise ?: return@withTarget
        _state.update { it.copy(circle = circle.copy(pending = raise)) }
        viewModelScope.launch {
            val cmid = quietly { circles.enqueueRaise(id, raise) }
            if (cmid == null) {
                rollbackRaise(id)
            } else {
                raiseCmids[cmid] = id
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                _events.emit(ProfileActionEvent.Toast(ProfileActionFeedback.RaiseSent))
            }
        }
    }

    private suspend fun receiveExhausted(cmid: String) {
        val userId = raiseCmids.remove(cmid) ?: return
        rollbackRaise(userId)
    }

    private suspend fun rollbackRaise(userId: String) {
        _state.update { state ->
            val circle = state.circle?.takeIf { state.userId == userId } ?: return@update state
            state.copy(circle = circle.copy(pending = null))
        }
        _events.emit(ProfileActionEvent.Toast(ProfileActionFeedback.RaiseFailed))
    }

    private suspend fun <T> quietly(block: suspend () -> T): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }

    fun requestConnection() = withTarget { connection.send(it) }
    fun acceptConnection() = withTarget { connection.accept(it) }
    fun declineConnection() = withTarget { connection.decline(it) }
    fun cancelConnection() = withTarget { connection.cancel(it) }

    fun resendConnection() = withTarget { id ->
        viewModelScope.launch {
            connection.cancel(id)?.join()
            connection.send(id)
        }
    }

    fun block() = setBlocked(blocked = true)
    fun unblock() = setBlocked(blocked = false)

    fun sendMessage() = openDirect(whenQueued = null) { _, conversationId -> ProfileActionEvent.OpenConversation(conversationId) }

    /** Hors ligne, la création du direct part en file mais l'appel, lui, ne sonnera pas : on le dit (miroir de `call.dial.notConnected`). */
    fun call(isVideo: Boolean, displayName: String) = openDirect(whenQueued = ProfileActionFeedback.CallNotPlaced) { id, conversationId ->
        ProfileActionEvent.Call(ProfileCallRequest(id, displayName, isVideo, conversationId))
    }

    private fun openDirect(
        whenQueued: ProfileActionFeedback?,
        onOpened: (userId: String, conversationId: String) -> ProfileActionEvent,
    ) = withTarget { id ->
        if (_state.value.isOpeningConversation) return@withTarget
        _state.update { it.copy(isOpeningConversation = true) }
        viewModelScope.launch {
            val result = try {
                directConversationOpener.openOrCreate(id)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                DirectOpenResult.Failed
            }
            _state.update { it.copy(isOpeningConversation = false) }
            when (result) {
                is DirectOpenResult.Opened -> _events.emit(onOpened(id, result.conversationId))
                DirectOpenResult.Queued -> whenQueued?.let { _events.emit(ProfileActionEvent.Toast(it)) }
                DirectOpenResult.Failed -> _events.emit(ProfileActionEvent.Toast(ProfileActionFeedback.OpenConversationFailed))
            }
        }
    }

    private fun setBlocked(blocked: Boolean) = withTarget { id ->
        viewModelScope.launch {
            val feedback = try {
                val cmid = blockRepository.setBlockedDurably(id, blocked)
                if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
                if (blocked) ProfileActionFeedback.UserBlocked else ProfileActionFeedback.UserUnblocked
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                if (blocked) ProfileActionFeedback.BlockFailed else ProfileActionFeedback.UnblockFailed
            }
            _events.emit(ProfileActionEvent.Toast(feedback))
        }
    }

    private fun refreshBlocklist() {
        viewModelScope.launch {
            try {
                blockRepository.listBlocked()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // The blocklist only refines the plan; the profile stays usable without it.
            }
        }
    }

    private fun rederive(bound: Target) {
        val myId = sessionRepository.currentUserId
        val isSelf = !myId.isNullOrBlank() && myId == bound.userId
        val plan = ProfileActionPlan.of(
            isSelf = isSelf,
            isAnonymous = bound.isAnonymous,
            connection = friendshipCache.status(bound.userId).toProfileConnection(),
            isBlockedByMe = blockCache.isBlocked(bound.userId),
            isBlockedByTarget = false,
            callsAvailable = bound.callsAvailable,
        )
        _state.update {
            it.copy(
                userId = bound.userId,
                plan = plan,
                render = ConnectionActionRender.from(resolver.resolve(bound.userId)),
            )
        }
    }

    private inline fun withTarget(action: (String) -> Unit) {
        target.value?.userId?.let(action)
    }

    private data class Target(val userId: String, val isAnonymous: Boolean, val callsAvailable: Boolean)
}

private fun FriendshipStatus.toProfileConnection(): ProfileConnection = when (this) {
    FriendshipStatus.Friend -> ProfileConnection.Connected
    is FriendshipStatus.PendingSent -> ProfileConnection.PendingSent(requestId)
    is FriendshipStatus.PendingReceived -> ProfileConnection.PendingReceived(requestId)
    else -> ProfileConnection.None
}
