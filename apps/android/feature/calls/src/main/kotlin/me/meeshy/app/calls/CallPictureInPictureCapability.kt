package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallPictureInPicturePolicy
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.icons.MeeshyIcons
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le Picture-in-Picture de l'appel vidéo (iOS `CallManager+SystemPiP`) : la fenêtre flottante
 * garde l'image du pair quand on quitte l'application ou qu'on touche « PiP ». L'activité s'y
 * inscrit ([attachActivity]) avec le geste d'entrée qu'elle seule sait faire ; ce coordinateur
 * sait QUAND il est permis ([CallPictureInPicturePolicy]) et dit à l'écran d'appel qu'il est en
 * fenêtre ([inPip]) pour qu'il retire ses commandes.
 */
@Singleton
class CallPictureInPictureCoordinator @Inject constructor() : CallFeatureController {
    @Volatile private var isVideoCall = false
    @Volatile private var isEstablished = false
    @Volatile private var callScreenShown = false
    @Volatile private var deviceSupportsPip = false
    @Volatile private var enter: (() -> Boolean)? = null
    @Volatile private var dismiss: (() -> Unit)? = null
    @Volatile private var heldByInAppLaunch = false

    private val _inPip = MutableStateFlow(false)

    /** `true` tant que l'activité est dans la fenêtre flottante. */
    val inPip: StateFlow<Boolean> = _inPip.asStateFlow()

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        isVideoCall = session.config.isVideo
        isEstablished = next is CallState.Connected
        if (next is CallState.Ended || next == CallState.Idle) leaveWindow()
    }

    override fun onCleared() {
        isEstablished = false
        leaveWindow()
    }

    /**
     * [enter] fait entrer l'activité dans la fenêtre flottante ; [dismiss] la retire quand l'appel
     * finit pendant qu'elle y est (iOS arrête son PiP avec l'appel) — sans lui, la fenêtre
     * resterait ouverte sur l'écran d'en dessous.
     */
    fun attachActivity(supportsPip: Boolean, enter: () -> Boolean, dismiss: () -> Unit = {}) {
        deviceSupportsPip = supportsPip
        this.enter = enter
        this.dismiss = dismiss
    }

    fun detachActivity() {
        enter = null
        dismiss = null
        _inPip.value = false
    }

    /**
     * L'activité lance une autre activité pour elle-même (consentement de partage d'écran,
     * sélecteur, partage, lien) : `onUserLeaveHint` qui suit n'est pas un départ de
     * l'utilisateur, la fenêtre flottante ne doit pas s'ouvrir par-dessus ce qu'on vient d'ouvrir.
     */
    fun holdForInAppLaunch() {
        heldByInAppLaunch = true
    }

    /** L'activité est revenue au premier plan : le prochain départ est de nouveau celui de l'utilisateur. */
    fun releaseInAppLaunch() {
        heldByInAppLaunch = false
    }

    fun setCallScreenShown(shown: Boolean) {
        callScreenShown = shown
    }

    fun setInPip(inPip: Boolean) {
        _inPip.value = inPip
    }

    /** L'action de la pilule est proposée pour cet instantané de l'appel. */
    fun offersAction(state: CallUiState): Boolean = CallPictureInPicturePolicy.offersAction(
        isVideoCall = state.isVideoCall,
        isEstablished = state.status == CallStatus.CONNECTED,
        deviceSupportsPip = deviceSupportsPip,
    )

    /** Le bouton PiP : entre en fenêtre si l'appel s'y prête. */
    fun requestEnter(): Boolean = enterIfAllowed()

    /** `onUserLeaveHint` : l'utilisateur quitte l'application pendant un appel vidéo. */
    fun onUserLeaveHint(): Boolean {
        if (heldByInAppLaunch) {
            heldByInAppLaunch = false
            return false
        }
        return enterIfAllowed()
    }

    private fun leaveWindow() {
        if (_inPip.value) dismiss?.invoke()
        _inPip.value = false
    }

    private fun enterIfAllowed(): Boolean {
        val allowed = CallPictureInPicturePolicy.mayEnter(isVideoCall, isEstablished, callScreenShown, deviceSupportsPip)
        return allowed && enter?.invoke() == true
    }
}

@Singleton
class CallPictureInPictureActionHandler @Inject constructor(
    private val pip: CallPictureInPictureCoordinator,
) : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? =
        if (pip.offersAction(state)) CallActionPresentation(MeeshyIcons.PictureInPicture, R.string.call_control_pip) else null

    override fun perform() {
        pip.requestEnter()
    }
}

@HiltViewModel
class CallPictureInPictureViewModel @Inject constructor(
    private val pip: CallPictureInPictureCoordinator,
) : ViewModel() {
    val inPip: StateFlow<Boolean> = pip.inPip

    fun callScreenShown(shown: Boolean) = pip.setCallScreenShown(shown)

    override fun onCleared() = pip.setCallScreenShown(false)
}

@Module
@InstallIn(SingletonComponent::class)
interface CallPictureInPictureCapabilityModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallPictureInPictureCoordinator): CallFeatureController

    @Binds
    @IntoMap
    @CallActionKey(CallAction.PictureInPicture)
    fun bindActionHandler(impl: CallPictureInPictureActionHandler): CallActionHandler
}
