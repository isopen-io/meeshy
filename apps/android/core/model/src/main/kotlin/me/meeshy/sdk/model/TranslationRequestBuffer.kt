package me.meeshy.sdk.model

/** Une demande de traduction mise de côté tant que la socket ne peut pas la porter. */
public data class PendingTranslationRequest(
    val messageId: String,
    val targetLanguage: String,
    val queuedAtMillis: Long,
)

/**
 * Le tampon des demandes de traduction déclenchées par l'utilisateur (miroir de `TranslationRequestBuffer`, iOS) :
 * un toucher sur un drapeau ne s'évapore pas parce que la socket est tombée. Borné ([MAX_SIZE], les plus
 * anciennes tombent d'abord) et périssable ([TIME_TO_LIVE_MILLIS]) : une longue coupure ne fait pas une fuite.
 * Immuable : chaque opération rend un nouveau tampon.
 */
public data class TranslationRequestBuffer(val pending: List<PendingTranslationRequest> = emptyList()) {

    /** Re-demander la même paire (message, langue) rafraîchit son horodatage au lieu de la doubler. */
    public fun enqueue(request: PendingTranslationRequest): TranslationRequestBuffer {
        val kept = pending.filterNot { it.messageId == request.messageId && it.targetLanguage == request.targetLanguage }
        return TranslationRequestBuffer((kept + request).takeLast(MAX_SIZE))
    }

    /** Vide le tampon et rend les demandes encore assez fraîches pour compter. */
    public fun drainFresh(nowMillis: Long): Pair<List<PendingTranslationRequest>, TranslationRequestBuffer> {
        val cutoff = nowMillis - TIME_TO_LIVE_MILLIS
        return pending.filter { it.queuedAtMillis >= cutoff } to TranslationRequestBuffer()
    }

    public companion object {
        public const val MAX_SIZE: Int = 50
        public const val TIME_TO_LIVE_MILLIS: Long = 60_000L

        /** Le nom de l'événement émis (client vers serveur) : une passerelle ancienne l'ignore. */
        public const val REQUEST_EVENT: String = "translation:request"
    }
}
