package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** État d'un job de traduction de pièce (`GET /translate/jobs/:jobId`) ; un état inconnu reste [UNKNOWN], jamais une erreur. */
enum class TranslationJobStatus(val wire: String, val terminal: Boolean) {
    PENDING("pending", false),
    PROCESSING("processing", false),
    COMPLETED("completed", true),
    FAILED("failed", true),
    CANCELLED("cancelled", true),
    UNKNOWN("", false),
    ;

    companion object {
        fun of(wire: String?): TranslationJobStatus = entries.firstOrNull { it.wire == wire && wire != "" } ?: UNKNOWN
    }
}

@Serializable
data class TranslationJob(
    val jobId: String = "",
    val status: String? = null,
    val progress: Double? = null,
    val attachmentId: String? = null,
    val sourceLanguage: String? = null,
    val targetLanguage: String? = null,
    val error: String? = null,
) {
    val state: TranslationJobStatus get() = TranslationJobStatus.of(status)
}
