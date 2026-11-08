package me.meeshy.sdk.voice

import java.io.File
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.VoiceConsentRequest
import me.meeshy.sdk.model.VoiceConsentResponse
import me.meeshy.sdk.model.VoiceConsentStatus
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.sdk.model.VoiceProfileAudioRequest
import me.meeshy.sdk.model.VoiceProfileDeleteResponse
import me.meeshy.sdk.model.VoiceSample
import me.meeshy.sdk.model.VoiceSampleUploadResponse
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.VoiceApi
import me.meeshy.sdk.net.apiCall
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

/** Miroir de `VoiceProfileServiceProviding` (iOS) : consentement, profil unique, échantillons, bascule du clonage, suppression RGPD. */
@Singleton
class VoiceProfileRepository @Inject constructor(
    private val api: VoiceApi,
    private val consents: ConsentsRepository,
    private val store: GrantedConsentsStore,
) {
    suspend fun consentStatus(): NetworkResult<VoiceConsentStatus> = apiCall { api.consentStatus() }

    /** Accorde l'enregistrement vocal et, si [voiceCloningConsent], la traduction vocale utilisant le profil ; [birthDate] porte la vérification d'âge. */
    suspend fun grantConsent(voiceCloningConsent: Boolean = false, birthDate: String? = null): NetworkResult<VoiceConsentResponse> {
        val body = VoiceConsentRequest(
            voiceRecordingConsent = true,
            voiceCloningConsent = if (voiceCloningConsent) true else null,
            birthDate = birthDate,
        )
        val result = apiCall { api.setConsent(body) }
        if (result is NetworkResult.Success) {
            val granted = buildSet {
                add(ConsentPurpose.VOICE_PROFILE)
                if (voiceCloningConsent) add(ConsentPurpose.VOICE_CLONING)
            }
            store.replace(store.granted.value + granted.flatMap { it.lineage })
        }
        return result
    }

    suspend fun revokeConsent(): NetworkResult<Unit> =
        when (val result = apiCall { api.setConsent(VoiceConsentRequest(voiceRecordingConsent = false)) }) {
            is NetworkResult.Success -> {
                consents.forgetLocally(ConsentPurpose.VOICE_PROFILE)
                NetworkResult.Success(Unit)
            }
            is NetworkResult.Failure -> result
        }

    /** Le profil unique, ou `null` quand il n'existe pas (état vide). */
    suspend fun profile(): NetworkResult<VoiceProfile?> = apiCall { api.profile() }.map { it.toDomain() }

    /** La passerelle ne modélise pas de collection d'échantillons : liste vide, comme iOS. */
    suspend fun samples(): List<VoiceSample> = emptyList()

    /**
     * Envoie un échantillon : sans profil => inscription (multipart sur fichier, rien en mémoire), avec profil => recalibrage.
     * Sans consentement actif, REFUS LOCAL avant tout réseau (`VOICE_CONSENT_REQUIRED`).
     */
    suspend fun uploadSample(file: File, durationMs: Int, format: String = "m4a"): NetworkResult<VoiceSampleUploadResponse> {
        if (ConsentPurpose.VOICE_PROFILE !in store.granted.value) {
            return NetworkResult.Failure(ApiError(message = "Voice consent required", code = CONSENT_REQUIRED))
        }
        val existing = when (val current = profile()) {
            is NetworkResult.Success -> current.data?.takeIf { it.id.isNotBlank() }
            is NetworkResult.Failure -> null
        }
        return if (existing != null) recalibrate(existing, file, durationMs, format) else register(file, durationMs, format)
    }

    private suspend fun register(file: File, durationMs: Int, format: String): NetworkResult<VoiceSampleUploadResponse> {
        val part = MultipartBody.Part.createFormData("file", file.name, file.asRequestBody(AUDIO_MEDIA_TYPE))
        return apiCall {
            api.register(part, format.toRequestBody(TEXT), durationMs.toString().toRequestBody(TEXT))
        }.map { VoiceSampleUploadResponse(it.profileId, it.profileId, durationMs, 1) }
    }

    private suspend fun recalibrate(existing: VoiceProfile, file: File, durationMs: Int, format: String): NetworkResult<VoiceSampleUploadResponse> {
        val body = VoiceProfileAudioRequest(Base64.getEncoder().encodeToString(file.readBytes()), format)
        return apiCall { api.recalibrate(existing.id, body) }
            .map { VoiceSampleUploadResponse(it.profileId, it.profileId, durationMs, existing.sampleCount + 1) }
    }

    /** Pilote le clonage par le consentement : `false` est écrit explicitement pour désactiver. */
    suspend fun toggleVoiceCloning(enabled: Boolean): NetworkResult<Unit> =
        when (val result = apiCall { api.setConsent(VoiceConsentRequest(voiceRecordingConsent = true, voiceCloningConsent = enabled)) }) {
            is NetworkResult.Success -> {
                if (enabled) store.replace(store.granted.value + ConsentPurpose.VOICE_CLONING.lineage)
                else store.replace(store.granted.value - ConsentPurpose.VOICE_CLONING)
                NetworkResult.Success(Unit)
            }
            is NetworkResult.Failure -> result
        }

    /** Suppression RGPD du profil entier (le consentement reste un choix distinct). */
    suspend fun deleteProfile(): NetworkResult<VoiceProfileDeleteResponse> = apiCall { api.deleteProfile() }

    companion object {
        const val CONSENT_REQUIRED: String = "VOICE_CONSENT_REQUIRED"
        private val AUDIO_MEDIA_TYPE = "audio/mp4".toMediaType()
        private val TEXT = "text/plain".toMediaType()
    }
}
