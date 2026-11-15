package me.meeshy.sdk.model.call

/**
 * Les événements de transcription d'un appel, côté signalisation (iOS `MessageSocketEvents+Calls`) :
 *
 *  - `call:transcription-active` entrant : [activeFrame] (décodage tolérant, `speakerId` estampillé par la passerelle) ;
 *  - `call:transcription-segment` sortant : [relayFrame] ne rend la charge que pour un segment FINAL d'un appel
 *    ACTIF — un segment hors appel actif, partiel, vide ou sans identifiant ne part jamais.
 */
object CallTranscriptionEvents {

    fun activeFrame(raw: String): CallTranscriptionActive? = CallSocialEventParser.transcriptionActive(raw)

    /** Les champs du `segment` à émettre pour [callId], ou `null` quand rien ne doit partir. */
    fun relayFrame(
        callId: String,
        activeCallId: String?,
        segment: CallTranscriptionSegmentWire,
    ): Map<String, Any?>? = when {
        callId.isBlank() || activeCallId.isNullOrBlank() || callId != activeCallId -> null
        !segment.isFinal || segment.text.isBlank() || segment.id.isBlank() || segment.speakerId.isBlank() -> null
        else -> segment.fields()
    }
}
