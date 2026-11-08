package me.meeshy.sdk.model.call

/** Ce que la mise en attente (ou sa reprise) demande à la vidéo sortante. */
public enum class CallHoldVideoAction {
    None,

    /** Couper la capture et dire au pair `call:toggle-video(false)`, l'intention de l'utilisateur restant intacte. */
    Suspend,

    /** Rallumer la capture et dire au pair `call:toggle-video(true)`. */
    Resume,

    /** La reprise tombe en arrière-plan : la caméra reste coupée, le cycle de vie de l'application la rallumera au retour. */
    HandOffToBackground,
}

/** Ce que la décision de la vidéo d'un appel lit au moment où l'attente change. */
public data class CallHoldInput(
    val onHold: Boolean,
    val isVideoCall: Boolean,
    /** L'intention de l'utilisateur : sa caméra est allumée (jamais touchée par l'attente). */
    val userCameraOn: Boolean,
    /** C'est la mise en attente qui a coupé la vidéo (et personne d'autre). */
    val videoHeldByHold: Boolean,
    /** La capture est déjà coupée parce que l'application est en arrière-plan. */
    val backgroundSuspended: Boolean,
    /** L'application n'est visible ni à l'écran ni en fenêtre flottante. */
    val hidden: Boolean,
    /** La survie de la liaison (ou la chaleur) a elle aussi suspendu la vidéo. */
    val survivalSuspended: Boolean,
)

/**
 * Miroir de iOS `CallVideoSuspension.handleHold` : un appel GSM ou une alarme met l'appel en attente, la vidéo
 * sortante se coupe pour que le pair voie une caméra coupée plutôt qu'une image figée, l'intention vidéo est
 * conservée et la vidéo repart seule à la reprise, sauf si la survie ou l'arrière-plan la suspend aussi.
 */
public object CallHoldPolicy {

    public fun videoAction(input: CallHoldInput): CallHoldVideoAction = when {
        !input.isVideoCall || !input.userCameraOn -> CallHoldVideoAction.None
        input.onHold -> suspendOnHold(input)
        else -> resumeAfterHold(input)
    }

    private fun suspendOnHold(input: CallHoldInput): CallHoldVideoAction =
        if (input.videoHeldByHold || input.backgroundSuspended) CallHoldVideoAction.None else CallHoldVideoAction.Suspend

    private fun resumeAfterHold(input: CallHoldInput): CallHoldVideoAction = when {
        !input.videoHeldByHold -> CallHoldVideoAction.None
        input.hidden -> CallHoldVideoAction.HandOffToBackground
        input.survivalSuspended -> CallHoldVideoAction.None
        else -> CallHoldVideoAction.Resume
    }

    /** Allumer la caméra pendant l'attente est refusé (le toast le dit) ; l'éteindre reste permis. */
    public fun refusesCameraActivation(onHold: Boolean, enabling: Boolean): Boolean = onHold && enabling

    /** L'appel est en attente dès que l'une de ses sources l'est : l'interface téléphonique ou le focus audio perdu. */
    public fun isOnHold(telecomHeld: Boolean, audioFocusLost: Boolean): Boolean = telecomHeld || audioFocusLost
}

/**
 * Les tonalités DTMF (RFC 4733) que le clavier d'une voiture ou d'une montre peut envoyer au pair :
 * `0-9 * # A-D`, en majuscules. Une chaîne vide ou qui porte un autre caractère est refusée en bloc.
 */
public object CallDtmfTones {
    private val ALLOWED = "0123456789*#ABCD".toSet()

    public fun normalize(digits: String): String? {
        val tones = digits.uppercase()
        return tones.takeIf { it.isNotEmpty() && it.all(ALLOWED::contains) }
    }
}
