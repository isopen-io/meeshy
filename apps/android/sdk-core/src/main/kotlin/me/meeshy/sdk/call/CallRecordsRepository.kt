package me.meeshy.sdk.call

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.CallRecordingLink
import me.meeshy.sdk.model.call.CallRecordingLinkRequest
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.model.call.CallTranscriptPaging
import me.meeshy.sdk.model.call.CallTranscriptReading
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

    /**
     * A1.6 — l'appel EN ENTIER : la passerelle sert [CallTranscriptPaging.PAGE_SIZE] phrases à la fois, on lit page après
     * page tant qu'elle dit `hasMore` (loi de [CallTranscriptReading]). Une page qui échoue fait échouer la lecture : un
     * appel à moitié lu ne se range pas au cache comme s'il était complet. Une lecture annulée (la bulle a quitté l'écran)
     * ne demande plus aucune page. Un `hasMore` encore vrai au rendu dit que la lecture s'est arrêtée avant la fin.
     */
    suspend fun fullTranscript(callId: String): NetworkResult<CallTranscriptPage> = ifPresent(callId) {
        currentCoroutineContext().ensureActive()
        when (val first = transcript(callId, offset = 0)) {
            is NetworkResult.Failure -> first
            is NetworkResult.Success -> readRemaining(callId, CallTranscriptReading.first(first.data))
        }
    }

    private suspend fun readRemaining(callId: String, from: CallTranscriptReading): NetworkResult<CallTranscriptPage> {
        var reading = from
        while (reading.continues) {
            currentCoroutineContext().ensureActive()
            when (val next = transcript(callId, offset = reading.offset)) {
                is NetworkResult.Failure -> return next
                is NetworkResult.Success -> reading = reading.absorbing(next.data)
            }
        }
        return NetworkResult.Success(reading.transcript)
    }

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
        const val TRANSCRIPT_PAGE_SIZE = CallTranscriptPaging.PAGE_SIZE
        const val INVALID_ARGUMENT = "INVALID_ARGUMENT"
    }
}
