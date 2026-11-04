package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult

/**
 * L'envoi de fond des médias POSÉS (#15598, iOS `ComposerPreUploadRegistry`) : un média se pose dès qu'il est prêt sur
 * l'appareil, sous un `cmid` qu'il garde jusqu'au bout, puis ses octets partent sans retenir l'écran — deux à la fois,
 * chacun disant sa part envoyée dans [StoryComposerUiState.uploadProgress]. Reçu, il devient un média envoyé
 * ([onResolved]) ; un refus définitif le retire ([onDropped]) ; tout autre échec le remet à la file DURABLE sous le même
 * `cmid` et propose « Réessayer ». Publier n'attend pas (iOS `ComposerPreUploadPolicy.publishReuses`) : [handOffAll]
 * remet à la file ce qui n'a pas fini, et la story en dépend — elle ne part qu'une fois son média reçu.
 */
internal class StoryComposerBackgroundUploads(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<StoryComposerUiState>,
    private val uploader: StoryMediaUploader,
    private val queue: MediaUploadQueue,
    private val onResolved: (cmid: String, media: UploadedMedia) -> Unit,
    private val onDropped: (cmid: String, reason: String) -> Unit,
) {
    private class Flight(val item: MediaUploadItem, val job: Job)

    private val flights = mutableMapOf<String, Flight>()
    private val turns = Semaphore(MAX_CONCURRENT)

    /** Les médias dont les octets partent encore, par `cmid`. */
    val inFlight: Set<String> get() = flights.keys.toSet()

    fun send(cmid: String, item: MediaUploadItem) {
        if (cmid in flights) return
        state.update { it.copy(uploadProgress = it.uploadProgress + (cmid to MediaUploadProgress.Idle), resendingUploads = it.resendingUploads + cmid) }
        val job = scope.launch(start = CoroutineStart.LAZY) {
            val result = try {
                turns.withPermit { uploader.uploadEach(listOf(item)) { _, sent, total -> progressed(cmid, sent, total) }.singleOrNull() }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                null
            }
            flights.remove(cmid)
            settle(cmid, item, result)
        }
        flights[cmid] = Flight(item, job)
        job.start()
    }

    /**
     * La publication part (#15598) : chaque envoi encore en route s'arrête et sa file durable le reprend sous le même
     * `cmid`, que la story attend. Les envois sont arrêtés AVANT tout retour : aucun ne peut se résoudre entre-temps.
     */
    fun stopForPublication(): List<PendingMediaUpload> {
        val stopped = flights.map { (cmid, flight) -> flight.job.cancel(); PendingMediaUpload(cmid, flight.item) }
        flights.clear()
        val ids = stopped.mapTo(mutableSetOf(), PendingMediaUpload::cmid)
        state.update { it.copy(uploadProgress = it.uploadProgress - ids, resendingUploads = it.resendingUploads - ids) }
        return stopped
    }

    /** [stopped] passent à la file durable ; un échec y laisse le média proposer « Réessayer », et l'erreur remonte. */
    suspend fun handOff(stopped: List<PendingMediaUpload>) {
        stopped.forEach { upload ->
            try {
                queue.enqueueAs(upload.cmid, upload.item, TusUploadContext.STORY)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                state.update { StoryComposerUploadResolution.failed(it, upload.cmid) }
                throw e
            }
        }
    }

    /** Un envoi que plus rien ne montre (abandon du brouillon, retrait sans retour possible) s'arrête là. */
    fun abandon(cmid: String) {
        flights.remove(cmid)?.job?.cancel() ?: return
        state.update { it.copy(uploadProgress = it.uploadProgress - cmid, resendingUploads = it.resendingUploads - cmid) }
    }

    fun abandonAll() = flights.keys.toList().forEach(::abandon)

    private fun progressed(cmid: String, sent: Long, total: Long) = state.update {
        if (cmid !in it.uploadProgress) it else it.copy(uploadProgress = it.uploadProgress + (cmid to MediaUploadProgress.Uploading(sent, total)))
    }

    private suspend fun settle(cmid: String, item: MediaUploadItem, result: NetworkResult<List<UploadedMedia>>?) {
        state.update { it.copy(uploadProgress = it.uploadProgress - cmid) }
        val received = (result as? NetworkResult.Success)?.data
        when {
            received != null && received.isNotEmpty() -> onResolved(cmid, received.first())
            received != null -> onDropped(cmid, StoryComposerViewModel.MEDIA_UNUSABLE)
            result is NetworkResult.Failure && StoryComposerUploadReducer.refusesForLocation(result.error) ->
                onDropped(cmid, StoryComposerUploadReducer.LOCATION_REFUSED)
            else -> queueDurably(cmid, item)
        }
    }

    private suspend fun queueDurably(cmid: String, item: MediaUploadItem) {
        try {
            queue.enqueueAs(cmid, item, TusUploadContext.STORY)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            Unit
        }
        state.update { StoryComposerUploadResolution.failed(it, cmid) }
    }

    private companion object {
        const val MAX_CONCURRENT = 2
    }
}
