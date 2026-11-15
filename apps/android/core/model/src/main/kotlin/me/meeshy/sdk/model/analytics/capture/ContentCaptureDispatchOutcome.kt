package me.meeshy.sdk.model.analytics.capture

import me.meeshy.sdk.model.ContentCaptureRefusal

/**
 * **Ce que la file fait d'une déclaration après un essai** — règle pure, miroir de `ContentCaptureDispatchOutcome` (iOS).
 */
enum class ContentCaptureDispatchOutcome {
    /** La passerelle a jugé : la ligne part. */
    DONE,

    /** À rejouer, avec le recul exponentiel de la file. */
    RETRY,

    /** Refus FINAL (non-participant, conversation close, forme refusée) : la ligne part sans rien annoncer. */
    DROP;

    companion object {
        /**
         * Essais au-delà desquels un message JUGÉ mais non annoncé n'est plus rejoué : la passerelle exige sa lecture
         * (`readAt`), que l'accusé de lecture posé à l'instant de la capture peut n'avoir pas encore livré.
         */
        const val UNNOTICED_RETRIES: Int = 2

        /** [attempts] : les essais déjà faits AVANT celui-ci. */
        fun of(result: Result<List<String>>, declared: List<String>, attempts: Int): ContentCaptureDispatchOutcome {
            result.getOrNull()?.let { noticed ->
                val missing = declared.toSet() - noticed.toSet()
                return if (missing.isEmpty() || attempts >= UNNOTICED_RETRIES) DONE else RETRY
            }
            val refusal = result.exceptionOrNull() as? ContentCaptureRefusal ?: return RETRY
            return when {
                refusal.code == ContentCaptureRefusal.RATE_LIMITED -> RETRY
                refusal.isFinal -> DROP
                else -> RETRY
            }
        }
    }
}
