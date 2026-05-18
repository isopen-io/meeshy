package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Voice profile consent status — port of VoiceConsentStatus (VoiceProfileModels.swift). */
@Serializable
data class VoiceConsentStatus(
    val hasConsent: Boolean = false,
    val consentedAt: String? = null,
    val ageVerified: Boolean = false,
    val ageVerifiedAt: String? = null,
    val voiceCloningEnabled: Boolean = false,
    val voiceCloningEnabledAt: String? = null,
)

@Serializable
data class VoiceConsentRequest(
    val consentGiven: Boolean,
    val ageVerification: Boolean,
    val birthDate: String? = null,
)

@Serializable
data class VoiceConsentResponse(
    val success: Boolean = false,
    val consentedAt: String? = null,
)

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
)

@Serializable
data class VoiceSampleUploadResponse(
    val sampleId: String = "",
    val profileId: String = "",
    val durationMs: Int = 0,
    val sampleCount: Int = 0,
)

@Serializable
data class VoiceCloningToggleRequest(
    val enabled: Boolean,
)

@Serializable
data class VoiceProfileDeleteResponse(
    val deleted: Boolean = false,
    val samplesDeleted: Int? = null,
)
