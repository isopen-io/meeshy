package me.meeshy.sdk.model

/**
 * Ce que la bulle d'un vocal montre à la place de la transcription (iOS `AudioPlayerView.transcriptionBlock`), du plus
 * prioritaire au moins : le TEXTE dès qu'il existe (le squelette devient texte sans action de l'utilisateur) ; le
 * SQUELETTE tant qu'une demande tourne ou qu'une transcription est attendue d'office (hauteur réservée, aucun saut) ;
 * « Transcrire » quand rien n'arrive et que la demande est permise (aussi après un échec reçu : on peut réessayer) ;
 * sinon rien. Une loi pure : la bulle n'en est qu'une projection.
 */
object AudioTranscriptionBlock {

    enum class Kind { TRANSCRIPT, SKELETON, REQUEST, NONE }

    fun of(
        hasTranscription: Boolean,
        reservedPassively: Boolean,
        request: MessageTranscriptionFiche.Request,
        canRequest: Boolean,
    ): Kind = when {
        hasTranscription -> Kind.TRANSCRIPT
        request == MessageTranscriptionFiche.Request.IN_FLIGHT || reservedPassively -> Kind.SKELETON
        canRequest -> Kind.REQUEST
        else -> Kind.NONE
    }
}
