package me.meeshy.sdk.model

/**
 * Relance bornée d'un vocal reçu avant sa transcription (miroir de la boucle de
 * `ConversationViewModel+Translations` iOS) : la transcription arrive d'ordinaire par
 * `transcription:ready`, mais si l'événement est perdu, le fil redemande — avec un recul
 * croissant, plafonné, et jamais une fois l'état prêt.
 */
object TranscriptionRetryScheduler {

    const val MAX_ATTEMPTS: Int = 6

    private val delaysMs: List<Long> = listOf(2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L)

    /**
     * Le délai avant la relance numéro [attempt] (0 = la première), ou `null` pour s'arrêter :
     * la transcription est déjà [ready], ou les [MAX_ATTEMPTS] relances sont épuisées.
     */
    fun nextDelayMs(attempt: Int, ready: Boolean): Long? {
        if (ready) return null
        if (attempt < 0 || attempt >= MAX_ATTEMPTS) return null
        return delaysMs[attempt]
    }

    /** `true` quand la pièce jointe audio [attachment] n'a pas encore de transcription lisible. */
    fun isPending(attachment: ApiMessageAttachment): Boolean {
        if (attachment.mimeType?.startsWith("audio/") != true) return false
        val transcription = attachment.transcription ?: return true
        return (transcription.transcribedText ?: transcription.text).isNullOrBlank()
    }
}
