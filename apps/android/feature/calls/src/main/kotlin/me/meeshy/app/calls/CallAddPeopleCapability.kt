package me.meeshy.app.calls

import android.content.Context
import androidx.lifecycle.ViewModel
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
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
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.friend.ContactList
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.icons.MeeshyIcons
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que le sélecteur « Ajouter à l'appel » montre : les amis lus, et ceux qui sonnent déjà. */
data class CallInviteUi(
    val friends: List<FriendRequestUser> = emptyList(),
    val isLoaded: Boolean = false,
    val ringing: Set<String> = emptySet(),
)

/**
 * « Ajouter des personnes » (iOS `CallControlsController.invite` + `CallAddPeopleSheet`, #13740) : on fait
 * sonner un ami accepté dans l'appel en cours (`call:invite-participant`, à accusé) ; il sonne aussitôt dans la
 * liste (optimiste), et un refus de la passerelle le retire et se dit. Une invitation qui se solde (refus,
 * expiration) ou un invité qui rejoint quitte la liste de ceux qui sonnent. Décrocher passe par le `call:join`
 * ordinaire de l'invité, et le maillage de l'appel le relie à chacun ([GroupCallMesh]).
 */
@Singleton
class CallInviteController internal constructor(
    private val social: CallSocialSignalManager,
    private val signals: CallSignalManager,
    private val loadFriends: suspend () -> List<FriendRequestUser>?,
    private val reportFailure: () -> Unit,
    private val scope: CoroutineScope,
) : CallFeatureController {
    @Inject
    constructor(
        social: CallSocialSignalManager,
        signals: CallSignalManager,
        friends: FriendRepository,
        session: SessionRepository,
        toasts: CallToastBus,
        @ApplicationContext context: Context,
    ) : this(
        social = social,
        signals = signals,
        loadFriends = {
            val me = session.currentUser.value?.id.orEmpty()
            friends.acceptedFriendRequests().getOrNull()?.let { ContactList.fromAcceptedRequests(it, me) }
        },
        reportFailure = { toasts.error(context.getString(R.string.call_invite_failed)) },
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
                if (session.callId != callId) _state.update { it.copy(ringing = emptySet()) }
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

    /** Fait sonner [userId] dans l'appel ; `false` tant que l'appel n'a pas d'identifiant. */
    fun invite(userId: String): Boolean {
        val target = callId.ifBlank { return false }
        _state.update { it.copy(ringing = it.ringing + userId) }
        scope.launch {
            social.inviteCallParticipant(target, userId).onFailure {
                _state.update { it.copy(ringing = it.ringing - userId) }
                reportFailure()
            }
        }
        return true
    }

    private fun listen(): Job = merge(
        social.participantInvited.onEach { if (it.callId == callId) ring(it.invitee.userId) },
        social.inviteSettled.onEach { if (it.callId == callId) settle(it.userId) },
        signals.participantArrivals.onEach { if (it.callId == callId) settle(it.arrival.userId) },
    ).launchIn(scope)

    private fun ring(userId: String) = _state.update { it.copy(ringing = it.ringing + userId) }

    private fun settle(userId: String) = _state.update { it.copy(ringing = it.ringing - userId) }

    private fun reset() {
        listening?.cancel()
        listening = null
        callId = ""
        _state.update { it.copy(ringing = emptySet()) }
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

    fun invite(userId: String): Boolean = controller.invite(userId)
}

@Module
@InstallIn(SingletonComponent::class)
interface CallAddPeopleCapabilityModule {
    @Binds
    @IntoSet
    fun bindInviteFeatureController(impl: CallInviteController): CallFeatureController

    @Binds
    @IntoMap
    @CallActionKey(CallAction.AddPeople)
    fun bindAddPeopleActionHandler(impl: CallAddPeopleActionHandler): CallActionHandler
}
