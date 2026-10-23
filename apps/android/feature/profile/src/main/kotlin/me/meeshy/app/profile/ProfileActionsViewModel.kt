package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
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
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.model.profile.ProfileActionPlan
import me.meeshy.sdk.model.profile.ProfileConnection
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class ProfileActionsState(
    val userId: String? = null,
    val plan: ProfileActionPlan? = null,
    val render: ConnectionActionRender = ConnectionActionRender.Hidden,
    val isOpeningConversation: Boolean = false,
)

/** Outcome of a profile gesture that is not a connection gesture (those come from the shared controller). */
enum class ProfileActionFeedback(val isError: Boolean) {
    UserBlocked(false),
    BlockFailed(true),
    UserUnblocked(false),
    UnblockFailed(true),
    OpenConversationFailed(true),
}

sealed interface ProfileActionEvent {
    data class OpenConversation(val conversationId: String) : ProfileActionEvent
    data class Toast(val feedback: ProfileActionFeedback) : ProfileActionEvent
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

    init {
        viewModelScope.launch {
            combine(target, friendshipCache.version, blockCache.version) { bound, _, _ -> bound }
                .collect { bound -> bound?.let(::rederive) }
        }
    }

    /** Points the actions at the resolved person; idempotent for the same id. */
    fun bind(userId: String, isAnonymous: Boolean) {
        if (userId.isBlank()) return
        val next = Target(userId, isAnonymous)
        if (target.value == next) return
        target.value = next
        rederive(next)
        if (blockCache.blockedCount == 0) refreshBlocklist()
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

    fun sendMessage() = withTarget { id ->
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
                is DirectOpenResult.Opened -> _events.emit(ProfileActionEvent.OpenConversation(result.conversationId))
                DirectOpenResult.Queued -> Unit
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
            callsAvailable = false,
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

    private data class Target(val userId: String, val isAnonymous: Boolean)
}

private fun FriendshipStatus.toProfileConnection(): ProfileConnection = when (this) {
    FriendshipStatus.Friend -> ProfileConnection.Connected
    is FriendshipStatus.PendingSent -> ProfileConnection.PendingSent(requestId)
    is FriendshipStatus.PendingReceived -> ProfileConnection.PendingReceived(requestId)
    else -> ProfileConnection.None
}
