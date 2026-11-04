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
 * l'appareil, sous un `cmid` qu'il garde jusqu'au bout, puis ses octets partent sans retenir l'écran — un choix à la
 * fois par voie, deux voies, chaque média suivant son issue et disant sa part envoyée dans [StoryComposerUiState.uploadProgress]. Reçu, il devient un média envoyé
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
    private class Flight(val uploads: List<PendingMediaUpload>) {
        lateinit var job: Job
    }

    private val flights = mutableListOf<Flight>()
    private val abandoned = mutableSetOf<String>()
    private val turns = Semaphore(MAX_CONCURRENT)

    /** Les médias d'un même choix partent ensemble, chacun suivant SON issue (#13959), dans l'ordre du choix. */
    fun send(batch: List<PendingMediaUpload>) {
        if (batch.isEmpty()) return
        val ids = batch.map(PendingMediaUpload::cmid)
        state.update { s -> s.copy(uploadProgress = s.uploadProgress + ids.associateWith { MediaUploadProgress.Idle }, resendingUploads = s.resendingUploads + ids) }
        val flight = Flight(batch)
        flight.job = scope.launch(start = CoroutineStart.LAZY) {
            val results = try {
                turns.withPermit { uploader.uploadEach(batch.map(PendingMediaUpload::item)) { index, sent, total -> batch.getOrNull(index)?.let { progressed(it.cmid, sent, total) } } }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                emptyList()
            }
            flights.remove(flight)
            batch.forEachIndexed { index, upload -> if (!abandoned.remove(upload.cmid)) settle(upload, results.getOrNull(index)) }
        }
        flights += flight
        flight.job.start()
    }

    /**
     * La publication part (#15598) : chaque envoi encore en route s'arrête et sa file durable le reprend sous le même
     * `cmid`, que la story attend. Les envois sont arrêtés AVANT tout retour : aucun ne peut se résoudre entre-temps.
     */
    fun stopForPublication(): List<PendingMediaUpload> {
        val stopped = flights.flatMap { flight -> flight.job.cancel(); flight.uploads }.filterNot { it.cmid in abandoned }
        flights.clear()
        abandoned.clear()
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
        val flight = flights.firstOrNull { flight -> flight.uploads.any { it.cmid == cmid } } ?: return
        abandoned += cmid
        state.update { it.copy(uploadProgress = it.uploadProgress - cmid, resendingUploads = it.resendingUploads - cmid) }
        if (flight.uploads.all { it.cmid in abandoned }) {
            flight.job.cancel()
            flights.remove(flight)
            abandoned -= flight.uploads.map(PendingMediaUpload::cmid).toSet()
        }
    }

    fun abandonAll() = flights.flatMap { it.uploads }.forEach { abandon(it.cmid) }

    private fun progressed(cmid: String, sent: Long, total: Long) = state.update {
        if (cmid !in it.uploadProgress) it else it.copy(uploadProgress = it.uploadProgress + (cmid to MediaUploadProgress.Uploading(sent, total)))
    }

    private suspend fun settle(upload: PendingMediaUpload, result: NetworkResult<List<UploadedMedia>>?) {
        val cmid = upload.cmid
        state.update { it.copy(uploadProgress = it.uploadProgress - cmid) }
        val received = (result as? NetworkResult.Success)?.data
        when {
            received != null && received.isNotEmpty() -> onResolved(cmid, received.first())
            received != null -> onDropped(cmid, StoryComposerViewModel.MEDIA_UNUSABLE)
            result is NetworkResult.Failure && StoryComposerUploadReducer.refusesForLocation(result.error) ->
                onDropped(cmid, StoryComposerUploadReducer.LOCATION_REFUSED)
            else -> queueDurably(upload)
        }
    }

    /** Un échec attend la file durable sous son `cmid` ; si même la file refuse ses octets, le média quitte la scène et le dit. */
    private suspend fun queueDurably(upload: PendingMediaUpload) {
        try {
            queue.enqueueAs(upload.cmid, upload.item, TusUploadContext.STORY)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            state.update { it.copy(resendingUploads = it.resendingUploads - upload.cmid) }
            return onDropped(upload.cmid, StoryComposerViewModel.MEDIA_FAILED)
        }
        state.update { StoryComposerUploadResolution.failed(it, upload.cmid) }
    }

    private companion object {
        const val MAX_CONCURRENT = 2
    }
}
