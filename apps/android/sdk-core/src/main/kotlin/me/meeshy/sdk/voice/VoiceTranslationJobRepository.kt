package me.meeshy.sdk.voice

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.voice.VoiceJobPollPlan
import me.meeshy.sdk.model.voice.VoiceTranslateAsyncRequest
import me.meeshy.sdk.model.voice.VoiceTranslationState
import me.meeshy.sdk.model.voice.reduceVoiceJobPoll
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.VoiceApi
import me.meeshy.sdk.net.apiCall

/**
 * Une traduction vocale asynchrone suivie par job, avec relance bornée. L'audio est une pièce DÉJÀ envoyée (TUS) : rien de volumineux
 * ne passe ici. Un échec expose [VoiceTranslationState.Failed] (« traduction impossible », relançable en rappelant [track]),
 * jamais une autre langue.
 */
@Singleton
class VoiceTranslationJobRepository @Inject constructor(
    private val api: VoiceApi,
) {
    fun track(
        request: VoiceTranslateAsyncRequest,
        plan: VoiceJobPollPlan = VoiceJobPollPlan(),
    ): Flow<VoiceTranslationState> = flow {
        emit(VoiceTranslationState.Idle)
        val accepted = when (val result = apiCall { api.translateAsync(request) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> {
                emit(VoiceTranslationState.Failed(null, result.error.code ?: result.error.message))
                return@flow
            }
        }
        val jobId = accepted.id
        if (jobId.isBlank()) {
            emit(VoiceTranslationState.Failed(null, "NO_JOB"))
            return@flow
        }
        emit(VoiceTranslationState.Running(jobId, 0.0, 0))
        var attempt = 0
        while (true) {
            delay(plan.delayBeforeMs(attempt))
            val state = when (val polled = apiCall { api.job(jobId) }) {
                is NetworkResult.Success -> reduceVoiceJobPoll(jobId, polled.data, attempt, plan)
                is NetworkResult.Failure ->
                    if (isPermanent(polled.error.httpStatus)) VoiceTranslationState.Failed(jobId, polled.error.code)
                    else if (attempt + 1 >= plan.maxAttempts) VoiceTranslationState.Failed(jobId, "timeout")
                    else VoiceTranslationState.Running(jobId, 0.0, attempt + 1)
            }
            emit(state)
            if (state !is VoiceTranslationState.Running) return@flow
            attempt = state.attempt
        }
    }

    suspend fun cancel(jobId: String): NetworkResult<Unit> = apiCall { api.cancelJob(jobId) }.map { }

    private fun isPermanent(status: Int?): Boolean = status != null && status in 400..499 && status != 408 && status != 429
}
