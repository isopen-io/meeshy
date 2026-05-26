package me.meeshy.sdk.net.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import retrofit2.http.Body
import retrofit2.http.POST

/** Blocking text translation request — port of TranslateRequest (ServiceModels.swift). */
@Serializable
data class TranslateRequest(
    val text: String,
    @SerialName("source_language") val sourceLanguage: String,
    @SerialName("target_language") val targetLanguage: String,
)

/** Blocking text translation response — port of TranslateResponse (ServiceModels.swift). */
@Serializable
data class TranslateResponse(
    @SerialName("translated_text") val translatedText: String = "",
    @SerialName("source_language") val detectedLanguage: String? = null,
)

/** Synchronous text translation — port of TranslationService (TranslationService.swift). */
interface TranslationApi {
    @POST("translate-blocking")
    suspend fun translate(@Body body: TranslateRequest): ApiResponse<TranslateResponse>
}
