package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi

/** Un traducteur à la demande qui échoue toujours et compte ses appels : les témoins d'enrichissement n'ont besoin que du fil. */
internal class NoTranslator : TranslationApi {
    var calls = 0

    override suspend fun translate(body: TranslateRequest): ApiResponse<TranslateResponse> {
        calls += 1
        return ApiResponse(success = false)
    }

    override suspend fun job(jobId: String): ApiResponse<me.meeshy.sdk.model.TranslationJob> = ApiResponse(success = false)

    override suspend fun cancelJob(jobId: String): ApiResponse<kotlinx.serialization.json.JsonElement> = ApiResponse(success = false)
}
