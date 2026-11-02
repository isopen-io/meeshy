package me.meeshy.sdk.model.call

enum class IncomingCallAnswer { Answer, AnswerAudioOnly, HangUp }

/**
 * Ce que « Accepter » devient une fois les permissions tranchées : micro refusé ⇒ on
 * raccroche (un appel décroché sans micro parle dans le vide) ; caméra refusée ⇒ on
 * répond en audio. Miroir de iOS `IncomingCallView.acceptCall`.
 */
object IncomingCallPermissionPolicy {
    fun decide(micGranted: Boolean, cameraGranted: Boolean, isVideo: Boolean): IncomingCallAnswer = when {
        !micGranted -> IncomingCallAnswer.HangUp
        isVideo && !cameraGranted -> IncomingCallAnswer.AnswerAudioOnly
        else -> IncomingCallAnswer.Answer
    }
}
