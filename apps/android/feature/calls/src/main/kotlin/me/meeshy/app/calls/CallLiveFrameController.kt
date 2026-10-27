package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallLiveFrameSelected
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallLiveFrameMachine
import me.meeshy.sdk.model.call.frames.CallLiveFrameOutgoing
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.frames.CallLiveFrameState
import me.meeshy.sdk.model.call.frames.CallLiveFrameStep
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.icons.MeeshyIcons
import timber.log.Timber

/** Un événement que l'écran doit dire à voix haute : le cadre n'a pas pu être proposé. */
enum class CallLiveFrameNotice { NotProposed }

/**
 * **LE CADRE EN DIRECT D'UN APPEL À DEUX** côté Android (miroir de iOS `CallLiveFrameSession`) : la
 * machine d'états pure [CallLiveFrameMachine] y rencontre la passerelle. Les événements `call:frame-select`
 * (émis) et `call:frame-selected` (reçu) sont ceux d'iOS : un cadre appliqué CHEZ MOI part comme une
 * PROPOSITION ; celle de l'autre attend mon « Appliquer » / « Non merci », et l'autre apprend ma réponse.
 * Rien n'est persisté : un nouvel appel repart sans cadre.
 */
@Singleton
class CallLiveFrameController internal constructor(
    private val social: CallSocialSignalManager,
    private val session: SessionRepository,
    private val scope: CoroutineScope,
) : CallFeatureController {
    @Inject
    constructor(social: CallSocialSignalManager, session: SessionRepository) :
        this(social, session, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))

    private val _state = MutableStateFlow(CallLiveFrameState())

    val state: StateFlow<CallLiveFrameState> = _state.asStateFlow()

    private val _notices = MutableStateFlow<CallLiveFrameNotice?>(null)
    val notices: StateFlow<CallLiveFrameNotice?> = _notices.asStateFlow()

    @Volatile private var callId: String? = null
    private var listening: Job? = null

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (next) {
            is CallState.Ended, CallState.Idle -> reset()
            else -> {
                val id = session.callId.ifBlank { null }
                if (callId != id) {
                    _state.value = CallLiveFrameState()
                    callId = id
                }
                if (listening == null) listening = social.frameSelected.onEach(::receive).launchIn(scope)
            }
        }
    }

    override fun onCleared() = reset()

    /** Mon cadre s'applique tout de suite chez moi, puis se propose. `null` le retire. Sans appel identifié, rien (iOS `guard let callId`). */
    fun apply(frameId: String?) {
        if (callId == null) return
        run(CallLiveFrameMachine.apply(_state.value, frameId, myName()))
    }

    fun accept() = run(CallLiveFrameMachine.accept(_state.value, myName()))

    fun decline() = run(CallLiveFrameMachine.decline(_state.value, myName()))

    fun dismissAnswer() {
        _state.value = CallLiveFrameMachine.dismissAnswer(_state.value)
    }

    internal fun receive(event: CallLiveFrameSelected) = run(CallLiveFrameMachine.receive(_state.value, event, callId, myName()))

    private fun run(step: CallLiveFrameStep) {
        _state.value = step.state
        val target = callId ?: return
        step.send.forEach { send(target, it) }
    }

    private fun send(target: String, outgoing: CallLiveFrameOutgoing) {
        scope.launch {
            social.selectCallLiveFrame(target, outgoing.frameId, outgoing.texts, outgoing.reply).onFailure { error ->
                Timber.w(error, "call-live-frame: refused")
                val id = outgoing.frameId
                if (outgoing.reply == null && id != null && callId == target && _state.value.sentProposal == id) {
                    _state.value = CallLiveFrameMachine.proposalRefused(_state.value, id)
                    _notices.value = CallLiveFrameNotice.NotProposed
                }
            }
        }
    }

    fun noticeShown() {
        _notices.value = null
    }

    /** Les deux personnes du duo, dans l'ordre des cases : moi, puis l'autre sous le prénom qu'il partage (sinon celui qu'on connaît). */
    fun people(peerName: String, remoteSharedName: String?): List<CallFramePerson> = CallLiveFrameRule.people(
        listOf(
            CallFramePerson(id = "me", name = myName().orEmpty(), handle = null, isSelf = true),
            CallFramePerson(id = "peer", name = peerName, handle = null, isSelf = false),
        ),
        remoteSharedName,
    )

    private fun myName(): String? = session.currentUser.value?.effectiveDisplayName?.takeIf { it.isNotBlank() }

    private fun reset() {
        listening?.cancel()
        listening = null
        callId = null
        _state.value = CallLiveFrameState()
        _notices.value = null
    }
}

/** « Capturer l'appel » dans la pilule : proposé en duo vidéo établi. C'est là que se choisit le cadre en direct, comme sur iOS. */
@Singleton
class CallCaptureActionHandler @Inject constructor() : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? =
        if (state.status == CallStatus.CONNECTED && CallLiveFrameRule.mayOffer(CallLiveFrameRule.PEOPLE, state.isVideoCall && state.showsConnectedLayout)) {
            CallActionPresentation(MeeshyIcons.Wallpaper, R.string.call_control_capture)
        } else {
            null
        }

    override fun perform() = Unit
}

@Module
@InstallIn(SingletonComponent::class)
interface CallLiveFrameCapabilityModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallLiveFrameController): CallFeatureController

    @Binds
    @IntoSet
    fun bindOverlay(impl: CallLiveFrameOverlay): CallOverlay

    @Binds
    @IntoSet
    fun bindStatusOverlay(impl: CallLiveFrameStatusOverlay): CallOverlay

    @Binds
    @IntoMap
    @CallActionKey(CallAction.Capture)
    fun bindActionHandler(impl: CallCaptureActionHandler): CallActionHandler
}
