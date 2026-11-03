package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallCameraSuspension
import me.meeshy.sdk.model.call.CallCameraSuspensionLaw

/**
 * La caméra d'un appel suit l'application (iOS `applyCameraSuspension`) : en arrière-plan la capture s'arrête et
 * le pair apprend `call:toggle-video(false)` ; au retour elle reprend et le pair en est averti. Dans la fenêtre
 * flottante l'appel reste visible, la caméra continue. La décision est [CallCameraSuspensionLaw] ; ce contrôleur
 * ne garde que le fait « c'est moi qui l'ai suspendue », pour ne rien rallumer que l'utilisateur ait éteint.
 */
internal class CallLifecycleController(
    private val inPictureInPicture: () -> Boolean,
    private val setCapture: (enabled: Boolean) -> Unit,
    private val announceVideo: (enabled: Boolean) -> Unit,
) {
    private var suspended = false
    private var foreground = true

    /** La capture est coupée parce que l'application est en arrière-plan. */
    val isSuspended: Boolean get() = suspended

    /** L'application n'est visible ni à l'écran ni en fenêtre flottante. */
    val isHidden: Boolean get() = !foreground && !inPictureInPicture()

    /**
     * La mise en attente reprend alors que l'application est cachée : la caméra est déjà coupée et le pair le sait,
     * le cycle de vie la rallumera au retour.
     */
    fun adoptSuspension() {
        suspended = true
    }

    /** L'attente vient de finir : rejoue le dernier état de l'application que la loi avait tu pendant l'attente. */
    fun reevaluate(isVideoCall: Boolean, userCameraOn: Boolean) = onAppState(foreground, isVideoCall, userCameraOn)

    fun onAppState(foreground: Boolean, isVideoCall: Boolean, userCameraOn: Boolean, onHold: Boolean = false) {
        this.foreground = foreground
        val decision = CallCameraSuspensionLaw.decide(
            foreground = foreground,
            inPictureInPicture = inPictureInPicture(),
            isVideoCall = isVideoCall,
            userCameraOn = userCameraOn,
            onHold = onHold,
            suspended = suspended,
        )
        when (decision) {
            CallCameraSuspension.None -> Unit
            CallCameraSuspension.Suspend -> change(suspend = true)
            CallCameraSuspension.Resume -> change(suspend = false)
        }
    }

    /** Un choix de l'utilisateur (couper, rallumer la caméra) reprend la main : plus rien n'est « suspendu par l'app ». */
    fun reset() {
        suspended = false
    }

    private fun change(suspend: Boolean) {
        suspended = suspend
        setCapture(!suspend)
        announceVideo(!suspend)
    }
}
