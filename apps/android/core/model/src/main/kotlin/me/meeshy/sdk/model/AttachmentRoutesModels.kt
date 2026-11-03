package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Une traduction d'UNE pièce, ligne de `POST /attachments/:id/translate` — miroir de `AttachmentTranslationResult` (iOS). */
@Serializable
data class AttachmentTranslationResult(
    val id: String = "",
    val targetLanguage: String = "",
    val translatedText: String? = null,
    val audioUrl: String? = null,
    val durationMs: Int? = null,
    val voiceCloned: Boolean? = null,
)

/**
 * Réponse de `POST /attachments/:id/translate`. Un [jobId] signale un traitement asynchrone, suivi par
 * `GET /translate/jobs/:jobId` ; les [translations] déjà prêtes sont rendues telles quelles.
 */
@Serializable
data class AttachmentTranslateResponse(
    val status: String? = null,
    val jobId: String? = null,
    val translations: List<AttachmentTranslationResult> = emptyList(),
)

/**
 * Un 403 qui porte une liste de consentements à donner — jamais une erreur « interdit » générique : l'écran
 * propose d'accorder ces consentements. Miroir de `AttachmentConsentError` (iOS).
 */
data class AttachmentConsentError(
    val code: String,
    val message: String,
    val requiredConsents: List<String>,
) {
    companion object {
        private const val FORBIDDEN = 403

        /** Non nul seulement pour un 403 dont la charge LISTE des consentements ; un 403 nu reste un refus ordinaire. */
        fun from(httpStatus: Int?, code: String?, message: String?, requiredConsents: List<String>?): AttachmentConsentError? {
            if (httpStatus != FORBIDDEN || requiredConsents == null) return null
            return AttachmentConsentError(
                code = code.orEmpty(),
                message = message?.takeIf { it.isNotBlank() } ?: "Consent required",
                requiredConsents = requiredConsents,
            )
        }
    }
}
