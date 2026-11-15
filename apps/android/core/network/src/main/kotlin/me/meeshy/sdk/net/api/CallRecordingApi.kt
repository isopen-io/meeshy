package me.meeshy.sdk.net.api

import kotlinx.coroutines.delay
import me.meeshy.sdk.model.call.CallRecordingLink
import me.meeshy.sdk.model.call.CallRecordingLinkRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Rattache le fichier d'un appel enregistré à la bulle de l'appel
 * (`POST /calls/:id/recordings/:id/attachment`). Le fichier peut arriver avant la bulle : la
 * passerelle répond alors 409 `CALL_BUBBLE_MISSING`, et on réessaie CE cas-là seulement
 * (3 essais, 2 s entre deux) — miroir de `CallRecordingController.link` (iOS).
 */
@Singleton
class CallRecordingApi @Inject constructor(
    private val callApi: CallApi,
) {
    suspend fun link(
        callId: String,
        recordingId: String,
        attachmentId: String,
        wait: suspend (Long) -> Unit = { delay(it) },
    ): NetworkResult<CallRecordingLink> {
        var attempt = 1
        while (true) {
            val result = apiCall { callApi.linkRecording(callId, recordingId, CallRecordingLinkRequest(attachmentId)) }
            if (result !is NetworkResult.Failure || !isBubbleMissing(result) || attempt >= LINK_ATTEMPTS) return result
            wait(LINK_RETRY_DELAY_MILLIS)
            attempt += 1
        }
    }

    private fun isBubbleMissing(failure: NetworkResult.Failure): Boolean =
        failure.error.httpStatus == 409 && failure.error.code.let { it == null || it == BUBBLE_MISSING || it == "HTTP_409" }

    companion object {
        const val LINK_ATTEMPTS = 3
        const val LINK_RETRY_DELAY_MILLIS = 2_000L
        const val BUBBLE_MISSING = "CALL_BUBBLE_MISSING"
    }
}
