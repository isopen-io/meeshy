package me.meeshy.sdk.model.call

/** La ligne d'état d'une sonnerie sortante. Miroir de iOS `CallView+States` (`sdpOfferSlow`). */
enum class OutgoingRingingLabel { Placing, WaitingForPeer }

/** Les six motifs de fin que le panneau de fin sait dire (iOS `CallView+Copy.endReasonText`). */
enum class CallEndMotive { Local, Remote, Rejected, Missed, ConnectionLost, Failed }

/**
 * Les lois de texte de l'écran d'appel, pures : « Appel en cours… » puis, passé
 * [SLOW_THRESHOLD_SECONDS], « En attente du correspondant… » avec son sous-texte ;
 * le motif de fin ; la fermeture automatique du panneau de fin.
 */
object CallStatusLabelLaw {
    const val SLOW_THRESHOLD_SECONDS: Long = 6
    const val ENDED_AUTO_DISMISS_MILLIS: Long = 1_500

    fun outgoing(secondsRinging: Long): OutgoingRingingLabel =
        if (secondsRinging >= SLOW_THRESHOLD_SECONDS) OutgoingRingingLabel.WaitingForPeer else OutgoingRingingLabel.Placing

    fun showsHint(label: OutgoingRingingLabel): Boolean = label == OutgoingRingingLabel.WaitingForPeer

    fun motive(reason: CallEndReason?): CallEndMotive = when (reason) {
        null, CallEndReason.Local -> CallEndMotive.Local
        CallEndReason.Remote -> CallEndMotive.Remote
        CallEndReason.Rejected -> CallEndMotive.Rejected
        CallEndReason.Missed -> CallEndMotive.Missed
        CallEndReason.ConnectionLost -> CallEndMotive.ConnectionLost
        is CallEndReason.Failed -> CallEndMotive.Failed
    }

    /** `null` : le panneau reste, un « Réessayer » est offert ; sinon il se ferme après cette durée. */
    fun autoDismissMillis(reason: CallEndReason?): Long? =
        if (CallRetryPolicy.isRetryable(reason)) null else ENDED_AUTO_DISMISS_MILLIS
}
