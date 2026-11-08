package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockFailure
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
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.relation.CirclePersonSetting
import me.meeshy.sdk.model.relation.ProfileCircle
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.relation.CirclesGateway
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class ProfileActionsState(
    val userId: String? = null,
    val plan: ProfileActionPlan? = null,
    val render: ConnectionActionRender = ConnectionActionRender.Hidden,
    val isOpeningConversation: Boolean = false,
    /** Le cercle commun servi (#13940) ; `null` sans lien servi : la fiche garde « Connectés ». */
    val circle: ProfileCircle? = null,
    /** Le niveau auquel la passerelle juge les outils de cercle (`accessLevel`, #16623) ; `null` tant qu'il n'est pas servi. */
    val toolLevel: RelationLevel? = null,
) {
    /**
     * Les blocages de réception que la FICHE propose (#16643) : ceux que le niveau d'outils servi ouvre au-delà du lien —
     * un collègue de l'équipe, Sang sans lien ou sous son lien réel. Quand le lien les ouvre tous, ils vivent sur la fiche du
     * lien ; sans niveau servi, rien.
     */
    val receptionsOnProfile: List<RelationReceptionSetting>
        get() {
            val opened = toolLevel?.let(CirclePersonSetting::receptionAt).orEmpty()
            val byLink = circle?.let { CirclePersonSetting.receptionAt(it.level) }.orEmpty()
            return if (opened.any { it !in byLink }) opened else emptyList()
        }
}

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

    /** La rétrogradation ou l'annulation du lien (#14910) a été refusée : le niveau d'avant est rendu. */
    LowerFailed(true),

    /** Le signalement en deux touches est parti, ou la passerelle l'a refusé. */
    ReportSent(false),
    ReportFailed(true),
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
    private val blockActions: BlockActionCoordinator,
    private val reportRepository: ReportRepository,
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
    private var lowerJob: Job? = null

    init {
        viewModelScope.launch {
            combine(target, friendshipCache.version, blockCache.version) { bound, _, _ -> bound }
                .collect { bound -> bound?.let(::rederive) }
        }
        viewModelScope.launch { circles.exhausted.collect { receiveExhausted(it) } }
        viewModelScope.launch { blockActions.failures.collect { receiveBlockFailure(it) } }
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
            val gate = quietly { circles.raiseGate(userId) }
            val blocked = gate?.blocks(System.currentTimeMillis()) ?: false
            val fresh = ProfileCircle.of(userId, served, sent)
            applyCircle(
                userId,
                fresh?.copy(pending = fresh.pending ?: pendingNow, raiseBlocked = blocked),
                gate?.accessLevel ?: _state.value.toolLevel,
            )
        }
    }

    /**
     * Rétrograder d'un cran, ou annuler le lien à Connaissance (#14910) — le dialogue de confirmation est déjà passé.
     * Instantané → niveau visé tout de suite → `POST /relations/:userId/level` → la vue servie, ou le niveau d'avant et
     * l'échec dit.
     */
    fun lowerCircle() = withTarget { id ->
        val before = _state.value.circle ?: return@withTarget
        val target = before.lowering ?: return@withTarget
        if (lowerJob?.isActive == true) return@withTarget
        circleJob?.cancel()
        val toolBefore = _state.value.toolLevel
        val toolAfter = toolBefore?.afterLowering(before.level, target)
        _state.update { it.copy(circle = before.lowered(), toolLevel = toolAfter) }
        lowerJob = viewModelScope.launch {
            when (val result = quietly { circles.lower(id, target) }) {
                is NetworkResult.Success -> applyCircle(
                    id,
                    ProfileCircle.of(id, listOf(result.data), emptyList())?.copy(raiseBlocked = before.raiseBlocked),
                    quietly { circles.raiseGate(id) }?.accessLevel ?: _state.value.toolLevel,
                )
                else -> {
                    applyCircle(id, before, toolBefore)
                    _events.emit(ProfileActionEvent.Toast(ProfileActionFeedback.LowerFailed))
                }
            }
        }
    }

    /**
     * Le niveau d'outils attendu après une baisse, avant que la passerelle le relise : un niveau servi AU-DESSUS du lien ne
     * vient pas du lien (un collègue de l'équipe) et ne bouge pas ; sinon il suit le cran visé (#16643).
     */
    private fun RelationLevel.afterLowering(linkLevel: RelationLevel, target: RelationLevel): RelationLevel =
        if (this > linkLevel) this else minOf(this, target)

    /** Le cercle et le niveau d'outils en UNE écriture : la fiche ne peint jamais l'un sans l'autre (#16643). */
    private fun applyCircle(userId: String, circle: ProfileCircle?, toolLevel: RelationLevel? = _state.value.toolLevel) {
        if (target.value?.userId != userId) return
        _state.update { it.copy(circle = circle, toolLevel = toolLevel) }
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

    /**
     * Instantané → cache → file durable (y compris hors ligne) → réveil du flusher, le tout par le
     * coordinateur unique ; si la file abandonne, il restaure l'état d'avant et [receiveBlockFailure] le dit.
     */
    private fun setBlocked(blocked: Boolean) = withTarget { id ->
        viewModelScope.launch {
            try {
                blockActions.setBlocked(id, blocked)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _events.emit(ProfileActionEvent.Toast(blockFailure(blocked)))
                return@launch
            }
            _events.emit(ProfileActionEvent.Toast(if (blocked) ProfileActionFeedback.UserBlocked else ProfileActionFeedback.UserUnblocked))
        }
    }

    private suspend fun receiveBlockFailure(failure: BlockFailure) {
        if (target.value?.userId != failure.userId) return
        _events.emit(ProfileActionEvent.Toast(blockFailure(failure.wasBlocking)))
    }

    private fun blockFailure(blocking: Boolean) =
        if (blocking) ProfileActionFeedback.BlockFailed else ProfileActionFeedback.UnblockFailed

    /** Signalement en deux touches : un motif, aucun détail (iso `submitReport`). Hors session ou en panne : l'échec se dit. */
    fun report(reason: ReportReason) = withTarget { id ->
        viewModelScope.launch {
            val sent = try {
                reportRepository.reportUser(id, reason, details = null) is NetworkResult.Success
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                false
            }
            _events.emit(ProfileActionEvent.Toast(if (sent) ProfileActionFeedback.ReportSent else ProfileActionFeedback.ReportFailed))
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
                toolLevel = it.toolLevel.takeIf { _ -> it.userId == bound.userId },
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
