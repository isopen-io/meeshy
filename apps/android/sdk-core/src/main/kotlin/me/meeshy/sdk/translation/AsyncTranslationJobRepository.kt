package me.meeshy.sdk.translation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.TranslationJob
import me.meeshy.sdk.model.TranslationJobStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.apiCall

/** Issue du suivi d'un job asynchrone : terminé, échoué, annulé, ou abandonné après la relance bornée. */
sealed interface TranslationJobOutcome {
    data class Completed(val job: TranslationJob) : TranslationJobOutcome
    data class Failed(val job: TranslationJob?, val error: ApiError?) : TranslationJobOutcome
    data object Cancelled : TranslationJobOutcome
    data object TimedOut : TranslationJobOutcome
}

/** Suit `GET /translate/jobs/:jobId` avec une relance bornée ; l'annulation de la coroutine arrête l'attente. */
@Singleton
class AsyncTranslationJobRepository @Inject constructor(
    private val api: TranslationApi,
) {
    suspend fun await(
        jobId: String,
        intervalMs: Long = DEFAULT_INTERVAL_MS,
        maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
    ): TranslationJobOutcome {
        var lastError: ApiError? = null
        for (attempt in 0 until maxAttempts) {
            val result = apiCall { api.job(jobId) }
            if (result is NetworkResult.Success) {
                when (result.data.state) {
                    TranslationJobStatus.COMPLETED -> return TranslationJobOutcome.Completed(result.data)
                    TranslationJobStatus.FAILED -> return TranslationJobOutcome.Failed(result.data, null)
                    TranslationJobStatus.CANCELLED -> return TranslationJobOutcome.Cancelled
                    else -> lastError = null
                }
            } else if (result is NetworkResult.Failure) {
                if (result.error.httpStatus in TERMINAL_HTTP) return TranslationJobOutcome.Failed(null, result.error)
                lastError = result.error
            }
            if (attempt < maxAttempts - 1) delay(intervalMs)
        }
        return lastError?.let { TranslationJobOutcome.Failed(null, it) } ?: TranslationJobOutcome.TimedOut
    }

    suspend fun cancel(jobId: String): NetworkResult<Unit> = apiCall { api.cancelJob(jobId) }.map { }

    private companion object {
        const val DEFAULT_INTERVAL_MS = 2_000L
        const val DEFAULT_MAX_ATTEMPTS = 30
        val TERMINAL_HTTP = setOf(401, 403, 404)
    }
}
