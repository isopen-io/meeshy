package me.meeshy.app.calls

import android.content.Context
import android.media.projection.MediaProjection
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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.screenshare.CallScreenShareLaw
import me.meeshy.sdk.model.call.screenshare.CallScreenSharePhase
import me.meeshy.sdk.model.call.screenshare.ScreenShareCapture
import me.meeshy.sdk.model.call.screenshare.ScreenShareStep
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.icons.MeeshyIcons
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** La piste vidéo sortante, vue du partage d'écran ; le moteur la sert, un double en test. */
interface CallScreenShareMedia {
    /** Branche l'écran à la place de ma caméra ; lève si la capture est refusée. */
    fun begin(projection: MediaProjection)

    /** Rend à l'émetteur vidéo ce qu'il portait avant le partage. */
    fun end()
}

/** Annonce le partage au pair (`call:toggle-screen`), qui le lit en `call:media-toggled` « screen ». */
fun interface CallScreenShareAnnouncer {
    fun announce(callId: String, enabled: Boolean)
}

/** Ce que l'écran d'appel montre du partage local. [consentRequest] compte les demandes de consentement. */
data class CallScreenShareUi(
    val phase: CallScreenSharePhase = CallScreenSharePhase.Idle,
    val asksConsent: Boolean = false,
    val consentRequest: Int = 0,
)

/**
 * Le partage d'écran d'un appel (#13332), miroir de iOS `CallScreenShareController` : un toucher demande
 * le consentement système (MediaProjection), la projection vivante branche la piste d'écran sur
 * l'émetteur vidéo et l'annonce au pair ; tout arrêt (bouton, notification, système, fin d'appel)
 * rend la caméra et libère la projection, tenue par [MediaProjectionService]. Les transitions sont
 * celles de [CallScreenShareLaw].
 */
@Singleton
class CallScreenShareController internal constructor(
    private val projections: MediaProjectionSession,
    private val media: CallScreenShareMedia,
    private val announcer: CallScreenShareAnnouncer,
    private val reportFailure: () -> Unit,
    scope: CoroutineScope,
) : CallFeatureController {
    @Inject
    constructor(
        projections: MediaProjectionSession,
        engine: WebRtcEngine,
        socials: CallSocialSignalManager,
        toasts: CallToastBus,
        @ApplicationContext context: Context,
    ) : this(
        projections = projections,
        media = object : CallScreenShareMedia {
            override fun begin(projection: MediaProjection) = engine.beginScreenShare(projection)
            override fun end() = engine.endScreenShare()
        },
        announcer = CallScreenShareAnnouncer(socials::emitToggleScreen),
        reportFailure = { toasts.error(context.getString(R.string.call_screen_share_error)) },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    )

    private val _state = MutableStateFlow(CallScreenShareUi())
    val state: StateFlow<CallScreenShareUi> = _state.asStateFlow()

    private var callId: String? = null
    private var isSharing = false
    private var capture = ScreenShareCapture.Idle
    private var asksConsent = false
    private var consentRequest = 0

    init {
        scope.launch { projections.state.collect(::onProjection) }
    }

    /** Le bouton : demande le partage au repos, l'arrête pendant une demande ou un partage. */
    fun toggle() {
        if (_state.value.phase != CallScreenSharePhase.Idle) return projections.stop()
        if (callId == null) return
        if (!projections.request(MediaProjectionPurpose.ScreenShare)) reportFailure()
    }

    /** La réponse du dialogue système. */
    fun onConsent(consent: MediaProjectionConsent) = projections.onConsent(consent)

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (next) {
            is CallState.Connected -> {
                callId = session.callId.ifBlank { null }
                if (previous is CallState.Reconnecting) announceIfSharing()
            }
            is CallState.Ended, CallState.Idle -> end()
            else -> Unit
        }
    }

    /** Un pair qui (re)joint apprend le partage en cours, comme iOS `announceIfSharing`. */
    override fun onRemoteEvent(event: CallEvent, session: CallSessionInfo) {
        if (event is CallEvent.ParticipantJoined) announceIfSharing()
    }

    private fun announceIfSharing() {
        val id = callId ?: return
        if (isSharing) announcer.announce(id, true)
    }

    override fun onCleared() = end()

    private fun end() {
        callId = null
        if (isSharing) {
            isSharing = false
            media.end()
        }
        if (capture == ScreenShareCapture.Pending || capture == ScreenShareCapture.Live) projections.onCallEnded()
        publish()
    }

    private fun onProjection(projection: MediaProjectionState) {
        capture = projection.asScreenShare()
        val asking = projection == MediaProjectionState.AwaitingConsent(MediaProjectionPurpose.ScreenShare)
        if (asking && !asksConsent) consentRequest += 1
        asksConsent = asking
        when (CallScreenShareLaw.step(isSharing, capture)) {
            ScreenShareStep.Attach -> attach()
            ScreenShareStep.Detach -> detach()
            ScreenShareStep.Report -> reportFailure()
            ScreenShareStep.Acknowledge -> projections.acknowledgeDenied()
            ScreenShareStep.None -> Unit
        }
        publish()
    }

    private fun attach() {
        val id = callId
        val projection = projections.projection()
        if (id == null || projection == null) return projections.stop()
        try {
            media.begin(projection)
        } catch (failure: Exception) {
            Timber.w(failure, "Screen share track refused")
            projections.stop()
            reportFailure()
            return
        }
        isSharing = true
        announcer.announce(id, true)
    }

    private fun detach() {
        isSharing = false
        media.end()
        callId?.let { announcer.announce(it, false) }
    }

    private fun publish() {
        _state.value = CallScreenShareUi(CallScreenShareLaw.phase(isSharing, capture), asksConsent, consentRequest)
    }

    private fun MediaProjectionState.asScreenShare(): ScreenShareCapture = when (this) {
        is MediaProjectionState.AwaitingConsent -> screenShare(purpose, ScreenShareCapture.Pending)
        is MediaProjectionState.Starting -> screenShare(purpose, ScreenShareCapture.Pending)
        is MediaProjectionState.Active -> screenShare(purpose, ScreenShareCapture.Live)
        is MediaProjectionState.Denied -> screenShare(purpose, ScreenShareCapture.Declined)
        is MediaProjectionState.Ended -> screenShare(
            purpose,
            if (reason == MediaProjectionEndReason.Failed) ScreenShareCapture.Failed else ScreenShareCapture.Over,
        )
        MediaProjectionState.Idle -> ScreenShareCapture.Idle
    }

    private fun screenShare(purpose: MediaProjectionPurpose, capture: ScreenShareCapture): ScreenShareCapture =
        if (purpose == MediaProjectionPurpose.ScreenShare) capture else ScreenShareCapture.Idle
}

/**
 * « Partager l'écran » (iOS `CallScreenShareCopy`) : offert sur un appel établi, en audio comme en vidéo ;
 * allumé et « Arrêter le partage d'écran » pendant une demande ou un partage. Il prend place dans la
 * pilule et dans la rangée « Effets · Écran » de ma vignette (`CallCameraRail.effectsRow`).
 */
@Singleton
class CallScreenShareActionHandler @Inject constructor(
    private val controller: CallScreenShareController,
) : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? {
        val phase = controller.state.value.phase
        val established = state.status == CallStatus.CONNECTED && state.showsConnectedLayout
        if (!CallScreenShareLaw.isOffered(established, phase)) return null
        val active = phase != CallScreenSharePhase.Idle
        return CallActionPresentation(
            icon = MeeshyIcons.FlipToFront,
            labelRes = if (active) R.string.call_screen_share_stop else R.string.call_screen_share_start,
            isActive = active,
            hintRes = R.string.call_screen_share_hint,
        )
    }

    override fun perform() = controller.toggle()
}

/** Le partage, lu par la pilule pour qu'elle se redessine quand il commence ou cesse. */
@HiltViewModel
class CallScreenShareViewModel @Inject constructor(controller: CallScreenShareController) : ViewModel() {
    val state: StateFlow<CallScreenShareUi> = controller.state
}

@Module
@InstallIn(SingletonComponent::class)
interface CallScreenShareCapabilityModule {
    @Binds
    @IntoSet
    fun bindScreenShareFeatureController(impl: CallScreenShareController): CallFeatureController

    @Binds
    @IntoSet
    fun bindScreenShareBannerOverlay(impl: CallScreenShareBannerOverlay): CallOverlay

    @Binds
    @IntoMap
    @CallActionKey(CallAction.ScreenShare)
    fun bindScreenShareActionHandler(impl: CallScreenShareActionHandler): CallActionHandler
}
