package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.VoiceConsentRequest
import me.meeshy.sdk.model.VoiceConsentResponse
import me.meeshy.sdk.model.VoiceConsentStatus
import me.meeshy.sdk.model.VoiceProfileAudioRequest
import me.meeshy.sdk.model.VoiceProfileDeleteResponse
import me.meeshy.sdk.model.VoiceProfileDetails
import me.meeshy.sdk.model.VoiceProfileRegisterResponse
import me.meeshy.sdk.model.voice.VoiceAnalyzeRequest
import me.meeshy.sdk.model.voice.VoiceCompareRequest
import me.meeshy.sdk.model.voice.VoiceFeedbackRequest
import me.meeshy.sdk.model.voice.VoiceJob
import me.meeshy.sdk.model.voice.VoiceJobAccepted
import me.meeshy.sdk.model.voice.VoiceTranscribeRequest
import me.meeshy.sdk.model.voice.VoiceTranslateAsyncRequest
import me.meeshy.sdk.net.routes.ApiRoutesVoice
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Le profil vocal, le consentement et la traduction vocale — miroir de `VoiceEndpoint` (iOS) et des routes
 * `/voice/…` de la passerelle. Les formes que Android lit sont typées ; celles qu'aucun écran ne projette encore
 * (analyses, historique, langues, métriques) restent un `JsonElement` brut.
 *
 * Les envois audio ne mettent jamais l'audio en mémoire : l'inscription du profil est un multipart sur FICHIER,
 * la traduction vise une pièce DÉJÀ envoyée par le pipeline TUS (`attachmentId`).
 */
interface VoiceApi {
    @GET(ApiRoutesVoice.PROFILE_CONSENT)
    suspend fun consentStatus(): ApiResponse<VoiceConsentStatus>

    @POST(ApiRoutesVoice.PROFILE_CONSENT)
    suspend fun setConsent(@Body body: VoiceConsentRequest): ApiResponse<VoiceConsentResponse>

    @GET(ApiRoutesVoice.PROFILE)
    suspend fun profile(): ApiResponse<VoiceProfileDetails>

    @DELETE(ApiRoutesVoice.PROFILE)
    suspend fun deleteProfile(): ApiResponse<VoiceProfileDeleteResponse>

    /** Crée le profil depuis un fichier audio (>= 10 s) : multipart `file` + `audioFormat` (+ `durationMs`). */
    @Multipart
    @POST(ApiRoutesVoice.PROFILE_REGISTER)
    suspend fun register(
        @Part file: MultipartBody.Part,
        @Part("audioFormat") audioFormat: RequestBody,
        @Part("durationMs") durationMs: RequestBody? = null,
    ): ApiResponse<VoiceProfileRegisterResponse>

    /** Recalibre le profil existant (JSON base64, la seule forme que la passerelle accepte ici). */
    @PUT(ApiRoutesVoice.PROFILE_BY_PROFILE_ID)
    suspend fun recalibrate(
        @Path("profileId") profileId: String,
        @Body body: VoiceProfileAudioRequest,
    ): ApiResponse<VoiceProfileRegisterResponse>

    @POST(ApiRoutesVoice.TRANSLATE)
    suspend fun translate(@Body body: VoiceTranslateAsyncRequest): ApiResponse<JsonElement>

    @POST(ApiRoutesVoice.TRANSLATE_ASYNC)
    suspend fun translateAsync(@Body body: VoiceTranslateAsyncRequest): ApiResponse<VoiceJobAccepted>

    @GET(ApiRoutesVoice.JOB_BY_JOB_ID)
    suspend fun job(@Path("jobId") jobId: String): ApiResponse<VoiceJob>

    @DELETE(ApiRoutesVoice.JOB_BY_JOB_ID)
    suspend fun cancelJob(@Path("jobId") jobId: String): ApiResponse<JsonElement>

    @POST(ApiRoutesVoice.TRANSCRIBE)
    suspend fun transcribe(@Body body: VoiceTranscribeRequest): ApiResponse<JsonElement>

    @POST(ApiRoutesVoice.ANALYZE)
    suspend fun analyze(@Body body: VoiceAnalyzeRequest): ApiResponse<JsonElement>

    @POST(ApiRoutesVoice.COMPARE)
    suspend fun compare(@Body body: VoiceCompareRequest): ApiResponse<JsonElement>

    @POST(ApiRoutesVoice.FEEDBACK)
    suspend fun feedback(@Body body: VoiceFeedbackRequest): ApiResponse<JsonElement>

    @GET(ApiRoutesVoice.HISTORY)
    suspend fun history(@Query("limit") limit: Int? = null, @Query("offset") offset: Int? = null): ApiResponse<JsonElement>

    @GET(ApiRoutesVoice.LANGUAGES)
    suspend fun languages(): ApiResponse<JsonElement>

    @GET(ApiRoutesVoice.ADMIN_METRICS)
    suspend fun adminMetrics(): ApiResponse<JsonElement>

    @GET(ApiRoutesVoice.ANALYSIS)
    suspend fun analysis(): ApiResponse<JsonElement>

    @POST(ApiRoutesVoice.ANALYSIS)
    suspend fun requestAnalysis(@Body body: JsonElement): ApiResponse<JsonElement>
}
