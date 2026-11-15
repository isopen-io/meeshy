package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallInvitedUser
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.group.CallInviteBoard
import me.meeshy.sdk.model.call.group.CallPendingInvite
import me.meeshy.sdk.model.friend.ContactList
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.icons.MeeshyIcons
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Ce que le sélecteur « Ajouter à l'appel » et la bande au-dessus de la pilule montrent : les amis lus, ceux qui
 * sonnent ([CallInviteBoard], #13753) et le mot qui suit la fin d'une invitation.
 */
data class CallInviteUi(
    val friends: List<FriendRequestUser> = emptyList(),
    val isLoaded: Boolean = false,
    val board: CallInviteBoard = CallInviteBoard(),
) {
    val ringing: Set<String> get() = board.ringingIds
}

/**
 * « Ajouter des personnes » (iOS `CallControlsController.invite` + `CallAddPeopleSheet`, #13740) : on fait
 * sonner un ami accepté dans l'appel en cours (`call:invite-participant`, à accusé) ; il sonne aussitôt dans la
 * bande (optimiste), et un refus de la passerelle le retire et se dit. Une invitation qui se solde dit « X a
 * refusé » ou « X n'a pas répondu » (#13753, la passerelle tient le délai de sonnerie) ; un invité qui rejoint quitte
 * la bande sans mot. Décrocher passe par le `call:join` ordinaire de l'invité, et le maillage de l'appel le relie à
 * chacun ([GroupCallMesh]).
 */
@Singleton
class CallInviteController internal constructor(
    private val social: CallSocialSignalManager,
    private val signals: CallSignalManager,
    private val loadFriends: suspend () -> List<FriendRequestUser>?,
    private val scope: CoroutineScope,
) : CallFeatureController {
    @Inject
    constructor(
        social: CallSocialSignalManager,
        signals: CallSignalManager,
        friends: FriendRepository,
        session: SessionRepository,
    ) : this(
        social = social,
        signals = signals,
        loadFriends = {
            val me = session.currentUser.value?.id.orEmpty()
            friends.acceptedFriendRequests().getOrNull()?.let { ContactList.fromAcceptedRequests(it, me) }
        },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    )

    private val _state = MutableStateFlow(CallInviteUi())
    val state: StateFlow<CallInviteUi> = _state.asStateFlow()

    @Volatile private var callId: String = ""
    private var listening: Job? = null

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (next) {
            is CallState.Ended, CallState.Idle -> reset()
            else -> {
                if (session.callId != callId) _state.update { it.copy(board = CallInviteBoard()) }
                callId = session.callId
                if (listening == null) listening = listen()
            }
        }
    }

    override fun onCleared() = reset()

    /** Lit les amis acceptés à chaque ouverture du sélecteur ; la liste déjà lue reste affichée pendant ce temps. */
    fun load() {
        scope.launch {
            val friends = loadFriends()
            _state.update { it.copy(friends = friends ?: it.friends, isLoaded = true) }
        }
    }

    /** Fait sonner [user] dans l'appel ; `false` tant que l'appel n'a pas d'identifiant, ou s'il sonne déjà. */
    fun invite(user: CallInvitedUser): Boolean {
        val target = callId.ifBlank { return false }
        if (_state.value.board.isRinging(user.userId)) return false
        board { it.inviting(CallPendingInvite.of(user)) }
        scope.launch {
            social.inviteCallParticipant(target, user.userId).onFailure { board { it.refused(user.userId) } }
        }
        return true
    }

    /** Le mot de retour s'efface (au bout de [CallInviteBoard.NOTICE_DISPLAY_MILLIS], ou d'un toucher). */
    fun dismissNotice() = board(CallInviteBoard::dismissingNotice)

    private fun listen(): Job = merge(
        social.participantInvited.onEach { event ->
            if (event.callId == callId) board { it.ringing(CallPendingInvite.of(event.invitee)) }
        },
        social.inviteSettled.onEach { event -> if (event.callId == callId) board { it.settled(event.userId, event.outcome) } },
        signals.participantArrivals.onEach { event -> if (event.callId == callId) board { it.withdrawn(event.arrival.userId) } },
    ).launchIn(scope)

    private fun board(transform: (CallInviteBoard) -> CallInviteBoard) =
        _state.update { it.copy(board = transform(it.board)) }

    private fun reset() {
        listening?.cancel()
        listening = null
        callId = ""
        _state.update { it.copy(board = CallInviteBoard()) }
    }
}

/**
 * « Ajouter des personnes à l'appel » : offert sur un appel établi (iOS `CallControlsLayout`, rangée « L'appel »),
 * en duo comme en groupe. Le toucher ouvre le panneau [me.meeshy.sdk.model.call.CallScreenPanel.People], que la
 * pilule ouvre d'elle-même ; il lit les amis à chaque ouverture.
 */
@Singleton
class CallAddPeopleActionHandler @Inject constructor(
    private val controller: CallInviteController,
) : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? {
        if (state.status != CallStatus.CONNECTED || !state.showsConnectedLayout) return null
        return CallActionPresentation(
            icon = MeeshyIcons.PersonAdd,
            labelRes = R.string.call_control_add_people,
            captionRes = R.string.call_control_add_people_caption,
        )
    }

    override fun perform() = controller.load()
}

/** Le sélecteur lit les amis et ceux qui sonnent ; inviter passe par le contrôleur de l'appel. */
@HiltViewModel
class CallInviteViewModel @Inject constructor(private val controller: CallInviteController) : ViewModel() {
    val state: StateFlow<CallInviteUi> = controller.state

    fun invite(user: CallInvitedUser): Boolean = controller.invite(user)
}

@Module
@InstallIn(SingletonComponent::class)
interface CallAddPeopleCapabilityModule {
    @Binds
    @IntoSet
    fun bindInviteFeatureController(impl: CallInviteController): CallFeatureController

    @Binds
    @IntoSet
    fun bindInviteOverlay(impl: CallInviteOverlay): CallOverlay

    @Binds
    @IntoMap
    @CallActionKey(CallAction.AddPeople)
    fun bindAddPeopleActionHandler(impl: CallAddPeopleActionHandler): CallActionHandler
}
