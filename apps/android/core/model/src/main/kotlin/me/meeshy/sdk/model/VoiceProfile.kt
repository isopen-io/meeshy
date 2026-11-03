package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Statut de consentement vocal — miroir de `VoiceConsentStatus` (VoiceProfileModels.swift) : la passerelle
 * (`GET /voice/profile/consent`) ne sert QUE les trois horodatages ; les booléens en sont dérivés.
 */
@Serializable
data class VoiceConsentStatus(
    val voiceRecordingConsentAt: String? = null,
    val voiceCloningEnabledAt: String? = null,
    val ageVerificationConsentAt: String? = null,
) {
    val hasConsent: Boolean get() = voiceRecordingConsentAt != null
    val consentedAt: String? get() = voiceRecordingConsentAt
    val ageVerified: Boolean get() = ageVerificationConsentAt != null
    val voiceCloningEnabled: Boolean get() = voiceCloningEnabledAt != null
}

/**
 * Corps de `POST /voice/profile/consent` (`VoiceProfileConsentRequest`). `voiceRecordingConsent` est REQUIS (donc
 * toujours écrit, même à `false` : la révocation) ; `voiceCloningConsent` n'est écrit que s'il est posé — `false`
 * explicite désactive le clonage, absent n'y touche pas.
 */
@Serializable
data class VoiceConsentRequest(
    val voiceRecordingConsent: Boolean,
    val voiceCloningConsent: Boolean? = null,
    val birthDate: String? = null,
)

/** Réponse de `POST /voice/profile/consent` : les mêmes trois horodatages que le statut. */
@Serializable
data class VoiceConsentResponse(
    val voiceRecordingConsentAt: String? = null,
    val voiceCloningEnabledAt: String? = null,
    val ageVerificationConsentAt: String? = null,
) {
    val consentedAt: String? get() = voiceRecordingConsentAt
}

/** Processing status of a voice profile — port of VoiceProfileStatus (VoiceProfileModels.swift). */
@Serializable
enum class VoiceProfileStatus {
    PENDING,
    PROCESSING,
    READY,
    FAILED,
    EXPIRED,
}

/** A user's voice profile — port of VoiceProfile (VoiceProfileModels.swift). */
@Serializable
data class VoiceProfile(
    val id: String,
    val userId: String = "",
    val status: VoiceProfileStatus = VoiceProfileStatus.PENDING,
    val sampleCount: Int = 0,
    val totalDurationMs: Int = 0,
    val quality: Double? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val lastUsedAt: String? = null,
) {
    val isReady: Boolean get() = status == VoiceProfileStatus.READY
    val totalDurationSeconds: Int get() = totalDurationMs / 1000
}

/**
 * Réponse brute de `GET /voice/profile` (`VoiceProfileDetails`) : UN profil unique, avec `exists` (jamais 404).
 * Décodage tolérant : tout champ manquant d'une vieille passerelle retombe sur son défaut.
 */
@Serializable
data class VoiceProfileDetails(
    val profileId: String? = null,
    val userId: String = "",
    val exists: Boolean? = null,
    val qualityScore: Double = 0.0,
    val audioDurationMs: Int = 0,
    val audioCount: Int = 0,
    val version: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val expiresAt: String? = null,
    val needsCalibration: Boolean = false,
    val consentStatus: VoiceConsentStatus? = null,
) {
    /** `exists` absent se déduit de la présence d'un `profileId`, comme iOS. */
    val profileExists: Boolean get() = exists ?: (profileId != null)

    /**
     * Le modèle domaine, ou `null` quand aucun profil n'existe (état vide). Le statut est dérivé faute d'enum
     * côté passerelle (`needsCalibration` => EXPIRED, sinon READY) ; `qualityScore` est déjà sur 0-1 en données
     * réelles, une valeur 0-100 héritée est ramenée (division si > 1) et 0 devient « inconnue ».
     */
    fun toDomain(): VoiceProfile? {
        if (!profileExists) return null
        val quality = when {
            qualityScore <= 0.0 -> null
            qualityScore > 1.0 -> qualityScore / 100.0
            else -> qualityScore
        }
        return VoiceProfile(
            id = profileId.orEmpty(),
            userId = userId,
            status = if (needsCalibration) VoiceProfileStatus.EXPIRED else VoiceProfileStatus.READY,
            sampleCount = audioCount,
            totalDurationMs = audioDurationMs,
            quality = quality,
            createdAt = createdAt,
            updatedAt = updatedAt,
        )
    }
}

/** Réponse de `POST /voice/profile/register` (audio >= 10 s) et `PUT /voice/profile/:profileId`. */
@Serializable
data class VoiceProfileRegisterResponse(
    val profileId: String = "",
    val qualityScore: Double = 0.0,
    val audioDurationMs: Int = 0,
    val needsCalibration: Boolean = false,
    val expiresAt: String? = null,
)

/** Corps JSON de `PUT /voice/profile/:profileId` (recalibrage) : `audioFormat` ∈ {wav, mp3, ogg, webm, m4a}. */
@Serializable
data class VoiceProfileAudioRequest(
    val audioData: String,
    val audioFormat: String,
)

/** A voice sample attached to a profile — port of VoiceSample (VoiceProfileModels.swift). */
@Serializable
data class VoiceSample(
    val id: String,
    val profileId: String = "",
    val durationMs: Int = 0,
    val fileUrl: String? = null,
    val status: String = "",
    val createdAt: String? = null,
) {
    val durationSeconds: Int get() = durationMs / 1000
}

@Serializable
data class VoiceSampleUploadResponse(
    val sampleId: String = "",
    val profileId: String = "",
    val durationMs: Int = 0,
    val sampleCount: Int = 0,
)

@Serializable
data class VoiceProfileDeleteResponse(
    val deleted: Boolean = false,
    val samplesDeleted: Int? = null,
)
