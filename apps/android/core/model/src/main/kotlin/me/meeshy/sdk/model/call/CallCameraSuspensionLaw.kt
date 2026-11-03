package me.meeshy.sdk.model.call

/** Ce que le cycle de vie demande à la caméra d'un appel. */
enum class CallCameraSuspension { None, Suspend, Resume }

/**
 * La caméra d'un appel suit l'application (miroir de iOS `applyCameraSuspension`) : en arrière-plan la capture
 * s'arrête et le pair apprend `call:toggle-video(false)` ; au retour elle reprend et le pair en est averti.
 * Dans la fenêtre flottante (PiP), l'appel reste visible : la caméra continue, et reprend si elle avait été suspendue.
 * Une caméra éteinte par choix, un appel sans vidéo ou un appel tenu en pause ne disent rien (le pair serait désynchronisé).
 */
object CallCameraSuspensionLaw {
    fun decide(
        foreground: Boolean,
        inPictureInPicture: Boolean,
        isVideoCall: Boolean,
        userCameraOn: Boolean,
        onHold: Boolean,
        suspended: Boolean,
    ): CallCameraSuspension {
        if (!isVideoCall || !userCameraOn || onHold) return CallCameraSuspension.None
        val visible = foreground || inPictureInPicture
        return when {
            !visible && !suspended -> CallCameraSuspension.Suspend
            visible && suspended -> CallCameraSuspension.Resume
            else -> CallCameraSuspension.None
        }
    }
}
