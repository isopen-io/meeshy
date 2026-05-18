package me.meeshy.sdk.translation

import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Synchronous text translation — port of TranslationService (TranslationService.swift). */
@Singleton
class TranslationRepository @Inject constructor(
    private val translationApi: TranslationApi,
) {
    suspend fun translate(
        text: String,
        sourceLanguage: String,
        targetLanguage: String,
    ): NetworkResult<TranslateResponse> =
        apiCall {
            translationApi.translate(TranslateRequest(text, sourceLanguage, targetLanguage))
        }
}
