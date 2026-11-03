package me.meeshy.app.calls

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallDtmf
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallHoldInput
import me.meeshy.sdk.model.call.CallHoldPolicy
import me.meeshy.sdk.model.call.CallHoldVideoAction
import me.meeshy.sdk.model.call.CallState
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que la mise en attente lit de l'appel et ce qu'elle lui commande : la vidéo sortante, jamais l'intention. */
interface CallHoldHost {
    val isVideoCall: Boolean

    /** L'intention de l'utilisateur : sa caméra est allumée. */
    val userCameraOn: Boolean

    /** La survie de la liaison (ou la chaleur) a elle aussi suspendu la vidéo. */
    val survivalSuspended: Boolean

    /** La capture est déjà coupée parce que l'application est en arrière-plan. */
    val backgroundSuspended: Boolean

    /** L'application n'est visible ni à l'écran ni en fenêtre flottante. */
    val hidden: Boolean

    fun setCapture(enabled: Boolean)

    fun announceVideo(enabled: Boolean)

    /** La reprise tombe en arrière-plan : le cycle de vie de l'application rallumera la caméra au retour. */
    fun adoptBackgroundSuspension()

    /** L'attente est levée : le cycle de vie rejoue l'état de l'application qu'il avait tu. */
    fun reevaluateLifecycle()

    /** L'état « en attente » a changé : l'écran se republie. */
    fun onHoldChanged()
}

/** La mise en attente d'un appel, vue du [CallViewModel] et du pont téléphonique. [Inert] pour les tests qui ne l'exercent pas. */
interface CallHolding {
    val isOnHold: StateFlow<Boolean>

    fun attach(host: CallHoldHost)

    /** L'interface téléphonique du système met l'appel en attente ou le reprend (`onSetInactive` / `onSetActive`). */
    fun onTelecomHold(onHold: Boolean)

    /** Le focus audio est perdu (appel GSM, alarme, assistant) ou rendu. */
    fun onAudioFocus(hasFocus: Boolean)

    /** La survie de la liaison a changé : une reprise due à l'attente part dès qu'elle se lève. */
    fun onSurvivalChanged(suspended: Boolean)

    /** Allumer la caméra en attente est refusé, et le toast le dit ; rend `true` quand la demande est refusée. */
    fun refusesCameraActivation(enabling: Boolean): Boolean

    object Inert : CallHolding {
        override val isOnHold: StateFlow<Boolean> = MutableStateFlow(false)
        override fun attach(host: CallHoldHost) = Unit
        override fun onTelecomHold(onHold: Boolean) = Unit
        override fun onAudioFocus(hasFocus: Boolean) = Unit
        override fun onSurvivalChanged(suspended: Boolean) = Unit
        override fun refusesCameraActivation(enabling: Boolean): Boolean = false
    }
}

/** Le texte du refus de caméra en attente, dans la langue d'interface du moment. */
fun interface CallHoldWording {
    fun cameraBlocked(): String
}

/**
 * Miroir de iOS `CallVideoSuspension.handleHold` : un appel GSM ou une alarme met l'appel en attente (Telecom
 * `onSetInactive`, ou perte du focus audio), la vidéo sortante se coupe et le pair voit une caméra coupée, l'intention
 * vidéo est conservée, et la vidéo repart seule à la reprise sauf si la survie ou l'arrière-plan la suspend aussi.
 * Chaque décision est [CallHoldPolicy] ; ce contrôleur ne garde que les faits (qui a coupé la vidéo, d'où vient l'attente).
 */
@Singleton
class CallHoldController @Inject constructor(
    private val toasts: CallToastBus,
    private val wording: CallHoldWording,
) : CallHolding, CallFeatureController {

    private val _isOnHold = MutableStateFlow(false)
    override val isOnHold: StateFlow<Boolean> = _isOnHold.asStateFlow()

    private var host: CallHoldHost? = null
    private var active = false
    private var telecomHeld = false
    private var focusLost = false
    private var videoHeldByHold = false

    override fun attach(host: CallHoldHost) {
        this.host = host
    }

    override fun onTelecomHold(onHold: Boolean) {
        telecomHeld = onHold
        sync()
    }

    override fun onAudioFocus(hasFocus: Boolean) {
        focusLost = !hasFocus
        sync()
    }

    override fun onSurvivalChanged(suspended: Boolean) {
        val current = host ?: return
        if (!suspended && videoHeldByHold && !_isOnHold.value) applyVideo(current, onHold = false)
    }

    override fun refusesCameraActivation(enabling: Boolean): Boolean {
        if (!CallHoldPolicy.refusesCameraActivation(_isOnHold.value, enabling)) return false
        toasts.error(wording.cameraBlocked())
        return true
    }

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        active = next.isActive
        if (!active) reset()
    }

    override fun onCleared() {
        reset()
        host = null
    }

    private fun reset() {
        telecomHeld = false
        focusLost = false
        videoHeldByHold = false
        if (_isOnHold.value) {
            _isOnHold.value = false
            host?.onHoldChanged()
        }
    }

    private fun sync() {
        val onHold = active && CallHoldPolicy.isOnHold(telecomHeld, focusLost)
        if (onHold == _isOnHold.value) return
        _isOnHold.value = onHold
        val current = host ?: return
        applyVideo(current, onHold)
        if (!onHold) current.reevaluateLifecycle()
        current.onHoldChanged()
    }

    private fun applyVideo(host: CallHoldHost, onHold: Boolean) {
        val action = CallHoldPolicy.videoAction(
            CallHoldInput(
                onHold = onHold,
                isVideoCall = host.isVideoCall,
                userCameraOn = host.userCameraOn,
                videoHeldByHold = videoHeldByHold,
                backgroundSuspended = host.backgroundSuspended,
                hidden = host.hidden,
                survivalSuspended = host.survivalSuspended,
            ),
        )
        when (action) {
            CallHoldVideoAction.Suspend -> {
                videoHeldByHold = true
                host.setCapture(false)
                host.announceVideo(false)
            }
            CallHoldVideoAction.Resume -> {
                videoHeldByHold = false
                host.setCapture(true)
                host.announceVideo(true)
            }
            CallHoldVideoAction.HandOffToBackground -> {
                videoHeldByHold = false
                host.adoptBackgroundSuspension()
            }
            CallHoldVideoAction.None -> if (!onHold) videoHeldByHold = videoHeldByHold && owesResume(host)
        }
    }

    /** Une reprise reste due tant que la seule chose qui la retient est la survie de la liaison. */
    private fun owesResume(host: CallHoldHost): Boolean = host.isVideoCall && host.userCameraOn && host.survivalSuspended
}

@Module
@InstallIn(SingletonComponent::class)
interface CallHoldModule {
    @Binds
    fun bindCallHolding(impl: CallHoldController): CallHolding

    @Binds
    @IntoSet
    fun bindCallHoldFeature(impl: CallHoldController): CallFeatureController
}

@Module
@InstallIn(SingletonComponent::class)
object CallHoldProvidesModule {
    @Provides
    @Singleton
    fun provideCallHoldWording(@ApplicationContext context: Context): CallHoldWording =
        CallHoldWording { context.getString(R.string.call_video_hold_blocked) }

    @Provides
    fun provideCallDtmf(engine: WebRtcEngine): CallDtmf = engine.dtmf
}
