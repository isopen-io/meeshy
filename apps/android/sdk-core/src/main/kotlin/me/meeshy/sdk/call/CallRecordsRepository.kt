package me.meeshy.sdk.call

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.CallRecordingLink
import me.meeshy.sdk.model.call.CallRecordingLinkRequest
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallApi
import me.meeshy.sdk.net.apiCall

/**
 * Ce qu'un appel laisse derrière lui, lu et écrit par ses routes REST : la session relue par
 * identifiant, la transcription persistée et le rattachement d'un enregistrement à la bulle
 * d'appel. Port des appels de `CallsEndpoint` (iOS).
 *
 * La transcription est une donnée SENSIBLE : ce dépôt ne la met nulle part en cache et ne la
 * journalise pas — elle se relit à la demande, réservée aux participants effectifs de l'appel.
 * Un identifiant vide ne part pas (la route deviendrait `calls//transcript`, un 404 certain).
 */
@Singleton
class CallRecordsRepository @Inject constructor(
    private val callApi: CallApi,
) {
    suspend fun details(callId: String): NetworkResult<ActiveCallSession> =
        ifPresent(callId) { apiCall { callApi.details(callId) } }

    /** Une page du journal de transcription, dans l'ordre de capture. [limit] est plafonné à 100 par la passerelle. */
    suspend fun transcript(
        callId: String,
        offset: Int = 0,
        limit: Int = TRANSCRIPT_PAGE_SIZE,
    ): NetworkResult<CallTranscriptPage> =
        ifPresent(callId) { apiCall { callApi.transcript(callId, offset.coerceAtLeast(0), limit.coerceIn(1, TRANSCRIPT_PAGE_SIZE)) } }

    /** Rattache le fichier téléversé d'un enregistrement consenti à la bulle d'appel — une fois, par celui qui a enregistré. */
    suspend fun linkRecording(
        callId: String,
        recordingId: String,
        attachmentId: String,
    ): NetworkResult<CallRecordingLink> =
        if (recordingId.isBlank() || attachmentId.isBlank()) {
            invalidArgument("recordingId et attachmentId sont requis")
        } else {
            ifPresent(callId) {
                apiCall { callApi.linkRecording(callId, recordingId, CallRecordingLinkRequest(attachmentId)) }
            }
        }

    private suspend fun <T> ifPresent(callId: String, call: suspend () -> NetworkResult<T>): NetworkResult<T> =
        if (callId.isBlank()) invalidArgument("callId est requis") else call()

    private fun invalidArgument(message: String): NetworkResult<Nothing> =
        NetworkResult.Failure(ApiError(message = message, code = INVALID_ARGUMENT))

    companion object {
        const val TRANSCRIPT_PAGE_SIZE = 100
        const val INVALID_ARGUMENT = "INVALID_ARGUMENT"
    }
}
