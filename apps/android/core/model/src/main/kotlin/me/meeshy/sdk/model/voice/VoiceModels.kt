package me.meeshy.sdk.model.voice

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Les finalités d'un consentement — miroir de `CONSENT_PURPOSES` (`packages/shared/types/consents.ts`) et de
 * `ConsentPurpose` (ConsentModels.swift). Le [wire] est la valeur de `PUT /me/consents/{purpose}`.
 */
enum class ConsentPurpose(val wire: String) {
    DATA_PROCESSING("data-processing"),
    ANALYTICS("analytics"),
    VOICE_DATA("voice-data"),
    VOICE_PROFILE("voice-profile"),
    VOICE_CLONING("voice-cloning"),
    ;

    /** Le parent direct — `CONSENT_PARENT`. */
    val parent: ConsentPurpose?
        get() = when (this) {
            DATA_PROCESSING -> null
            ANALYTICS, VOICE_DATA -> DATA_PROCESSING
            VOICE_PROFILE -> VOICE_DATA
            VOICE_CLONING -> VOICE_PROFILE
        }

    /** La finalité suivie de ses ancêtres : ce qu'un octroi réussi rend accordé (la passerelle pose les ancêtres). */
    val lineage: List<ConsentPurpose> get() = listOf(this) + (parent?.lineage ?: emptyList())

    companion object {
        fun fromWire(value: String): ConsentPurpose? = entries.firstOrNull { it.wire == value }
    }
}

object ConsentPolicy {
    /** `CONSENT_POLICY_VERSION_DEFAULT` : la passerelle répond 409 à toute autre valeur. */
    const val DEFAULT_VERSION: String = "2026-08-30"
}

/** Une entrée de `GET /me/consents` ; `purpose` reste une chaîne : une finalité inconnue n'invalide pas les autres. */
@Serializable
data class ConsentEntry(
    val purpose: String = "",
    val granted: Boolean = false,
    val grantedAt: String? = null,
    val policyVersion: String = "",
) {
    val consentPurpose: ConsentPurpose? get() = ConsentPurpose.fromWire(purpose)
}

@Serializable
data class ConsentsSnapshot(val consents: List<ConsentEntry> = emptyList())

/** Corps entier de `PUT /me/consents/{purpose}` (strict côté passerelle : aucune date, le serveur horodate). */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ConsentUpdateRequest(
    val granted: Boolean,
    @EncodeDefault val policyVersion: String = ConsentPolicy.DEFAULT_VERSION,
)

/** Les finalités accordées d'une relecture, ancêtres compris ; une finalité inconnue est ignorée. */
fun List<ConsentEntry>.grantedPurposes(): Set<ConsentPurpose> =
    filter { it.granted }.mapNotNull { it.consentPurpose }.toSet()

/**
 * Faut-il montrer la note de consentement sous un vocal ? Miroir de `AudioMediaView.shouldShowConsentNotice`
 * (iOS) : la note invite l'auteur du vocal à activer SON consentement, donc sur son propre vocal et seulement
 * tant que la passerelle ne l'a pas confirmé. Jamais pour un tiers, jamais sur un consentement inconnu.
 */
fun shouldShowConsentNotice(isOwn: Boolean, voiceConsentMissing: Boolean): Boolean = isOwn && voiceConsentMissing

/** Corps de `POST /voice/translate/async` : l'audio est une pièce déjà envoyée (TUS), jamais une charge en mémoire. */
@Serializable
data class VoiceTranslateAsyncRequest(
    val attachmentId: String,
    val targetLanguages: List<String>,
    val sourceLanguage: String? = null,
    val generateVoiceClone: Boolean? = null,
)

/** Réponse 202 de `POST /voice/translate/async`. */
@Serializable
data class VoiceJobAccepted(
    val jobId: String = "",
    val taskId: String = "",
    val status: String = "",
) {
    val id: String get() = jobId.ifBlank { taskId }
}

/** Statut d'un job de traduction vocale (`TranslationJobStatus`). Une valeur inconnue vaut PENDING (on continue d'attendre). */
@Serializable
enum class VoiceJobStatus {
    @SerialName("pending") PENDING,
    @SerialName("processing") PROCESSING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    ;

    val isTerminal: Boolean get() = this == COMPLETED || this == FAILED || this == CANCELLED
}

/** Réponse de `GET /voice/job/:jobId` (`TranslationJob`) ; le résultat est gardé brut (la forme suit le moteur). */
@Serializable
data class VoiceJob(
    val jobId: String = "",
    val status: VoiceJobStatus = VoiceJobStatus.PENDING,
    val progress: Double = 0.0,
    val currentStep: String? = null,
    val error: String? = null,
    val result: kotlinx.serialization.json.JsonElement? = null,
)

/** Corps de `POST /voice/transcribe` en JSON (alternative au multipart) : une pièce existante. */
@Serializable
data class VoiceTranscribeRequest(
    val attachmentId: String? = null,
    val language: String? = null,
)

@Serializable
data class VoiceAnalyzeRequest(
    val audioBase64: String,
    val analysisTypes: List<String>? = null,
)

@Serializable
data class VoiceCompareRequest(
    val audioBase64_1: String,
    val audioBase64_2: String,
)

@Serializable
data class VoiceFeedbackRequest(
    val translationId: String,
    val rating: Int,
    val feedbackType: String? = null,
    val comment: String? = null,
)

/** Le sondage d'un job : essais bornés et délais croissants ; épuisé, le job est « impossible » (jamais une autre langue). */
data class VoiceJobPollPlan(
    val maxAttempts: Int = 20,
    val firstDelayMs: Long = 1_000,
    val maxDelayMs: Long = 8_000,
) {
    /** Le délai avant l'essai numéro [attempt] (0 = avant le premier relevé), doublé jusqu'au plafond. */
    fun delayBeforeMs(attempt: Int): Long {
        if (attempt <= 0) return firstDelayMs
        val doubled = firstDelayMs shl attempt.coerceAtMost(20)
        return doubled.coerceAtMost(maxDelayMs)
    }
}

/** L'état d'une traduction asynchrone suivie par job. */
sealed interface VoiceTranslationState {
    data object Idle : VoiceTranslationState
    data class Running(val jobId: String, val progress: Double, val attempt: Int) : VoiceTranslationState
    data class Done(val jobId: String, val job: VoiceJob) : VoiceTranslationState

    /** « Traduction impossible » : relançable, jamais remplacée par une autre langue. */
    data class Failed(val jobId: String?, val reason: String?) : VoiceTranslationState
}

/** Réduit un relevé de job en état suivant ; épuisement des essais => [VoiceTranslationState.Failed]. */
fun reduceVoiceJobPoll(
    jobId: String,
    job: VoiceJob,
    attempt: Int,
    plan: VoiceJobPollPlan = VoiceJobPollPlan(),
): VoiceTranslationState = when (job.status) {
    VoiceJobStatus.COMPLETED -> VoiceTranslationState.Done(jobId, job)
    VoiceJobStatus.FAILED, VoiceJobStatus.CANCELLED -> VoiceTranslationState.Failed(jobId, job.error)
    VoiceJobStatus.PENDING, VoiceJobStatus.PROCESSING ->
        if (attempt + 1 >= plan.maxAttempts) VoiceTranslationState.Failed(jobId, "timeout")
        else VoiceTranslationState.Running(jobId, job.progress, attempt + 1)
}
