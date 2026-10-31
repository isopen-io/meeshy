package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult

/**
 * Le chemin d'un choix de médias jusqu'à la scène (R4 et R5 de #13863) : chacun prend la place que [StoryComposerUploadReducer]
 * lui donne, son espace réservé se tient sur la scène pendant la préparation et l'envoi, et ✕ l'annule en rendant tout dans
 * la même image. Chaque média suit SON issue (#13959) : reçu, il se pose aussitôt ; un échec ou un refus de la passerelle
 * se met en file DURABLE derrière son espace réservé (#13417), qui dit « Hors ligne » sans réseau et sinon propose
 * « Réessayer » ([StoryComposerPendingRetry] le relance, seul au retour du réseau) ; une erreur qu'aucune file ne reprend
 * garde les octets pour « Réessayer », et les rend dès que ce nouvel essai n'a plus lieu (autre choix, composeur quitté).
 * Un second choix pendant un envoi est ignoré.
 */
internal class StoryComposerMediaPick(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<StoryComposerUiState>,
    private val uploader: StoryMediaUploader,
    private val queue: MediaUploadQueue,
    private val record: () -> Unit,
) {
    private class Pick(val items: List<MediaUploadItem>, val asBackground: Boolean)

    private var job: Job? = null
    private var inFlight: List<MediaUploadItem> = emptyList()
    private var retained: Pick? = null

    fun pick(items: List<MediaUploadItem>, asBackground: Boolean) {
        if (items.isEmpty() || state.value.isUploadingMedia) return
        giveUpRetry()
        start(Pick(items, asBackground))
    }

    fun retry() {
        val pick = retained ?: return
        if (state.value.isUploadingMedia) return
        retained = null
        state.update { it.copy(canRetryMedia = false, errorMessage = null) }
        start(pick)
    }

    /** ✕ : l'envoi s'arrête, l'espace réservé part et l'écran se libère dans la même image ; les octets choisis sont rendus. */
    fun cancel() {
        val running = job?.takeIf { it.isActive } ?: return
        job = null
        running.cancel()
        releaseUnqueued(inFlight)
        inFlight = emptyList()
        state.update(StoryComposerUploadReducer::settled)
    }

    /** Le composeur se ferme : plus aucun essai n'aura lieu, ses octets sont rendus. */
    fun cleared() {
        giveUpRetry()
        if (job?.isActive == true) releaseUnqueued(inFlight)
    }

    private fun giveUpRetry() {
        retained?.items?.forEach(MediaIntake::release)
        retained = null
        if (state.value.canRetryMedia) state.update { it.copy(canRetryMedia = false) }
    }

    private fun start(pick: Pick) {
        val current = state.value
        val landings = StoryComposerUploadReducer.landings(current, pick.items.size, pick.asBackground)
        if (landings.any { !it.newSlide } && current.deck.selectedRemainingMediaSlots <= 0) {
            state.update { it.copy(errorMessage = StoryComposerViewModel.MEDIA_LIMIT) }
            return
        }
        val accepted = pick.items.take(landings.size)
        pick.items.drop(landings.size).forEach(MediaIntake::release)
        state.update { StoryComposerUploadReducer.started(it, landings, refused = pick.items.size - accepted.size, items = accepted) }
        inFlight = accepted
        job = scope.launch { send(Pick(accepted, pick.asBackground)) }
    }

    private suspend fun send(pick: Pick) {
        try {
            val onProgress = { index: Int, sent: Long, total: Long ->
                state.update { StoryComposerUploadReducer.progressed(it, index, sent, total) }
            }
            val results = uploader.uploadEach(pick.items, onProgress)
            currentCoroutineContext().ensureActive()
            settle(pick, results)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            val kept = pick.items.filter { item -> state.value.pendingUploads.none { it.item === item } }
            retained = Pick(kept, pick.asBackground).takeIf { kept.isNotEmpty() }
            state.update {
                StoryComposerUploadReducer.settled(it).copy(errorMessage = StoryComposerViewModel.MEDIA_FAILED, canRetryMedia = kept.isNotEmpty())
            }
        }
    }

    /**
     * Each media of the pick takes its own outcome (#13959), in pick order: received, it lands; refused for its location, it
     * is dropped and said; failed otherwise, it waits in the durable queue at its place — said « Hors ligne » only without
     * network, else offered again (« Réessayer »). One failure never sends a received sibling back to the queue.
     */
    private suspend fun settle(pick: Pick, results: List<NetworkResult<List<UploadedMedia>>>) {
        var said: String? = null
        var changed = false
        pick.items.forEachIndexed { index, item ->
            when (val result = results.getOrNull(index)) {
                is NetworkResult.Success -> {
                    MediaIntake.release(item)
                    if (result.data.isEmpty()) said = StoryComposerViewModel.MEDIA_UNUSABLE
                    result.data.forEachIndexed { rank, media ->
                        state.update { StoryComposerUploadReducer.landedAt(it, media, pick.asBackground, index.takeIf { rank == 0 }) }
                        changed = true
                    }
                }
                is NetworkResult.Failure -> if (StoryComposerUploadReducer.refusesForLocation(result.error)) {
                    MediaIntake.release(item)
                    said = StoryComposerUploadReducer.LOCATION_REFUSED
                } else {
                    queueDurably(item, index, pick.asBackground)
                    changed = true
                }
                null -> {
                    queueDurably(item, index, pick.asBackground)
                    changed = true
                }
            }
        }
        state.update { settled -> StoryComposerUploadReducer.settled(settled).let { s -> said?.let { s.copy(errorMessage = it) } ?: s } }
        if (changed) record()
    }

    /** A failed upload (a refusal included, #13417) is queued durably: its blob and outbox row share the `cmid` that rides in the draft as a placeholder id. */
    private suspend fun queueDurably(item: MediaUploadItem, index: Int, asBackground: Boolean) {
        val cmid = queue.enqueue(item, context = TusUploadContext.STORY)
        state.update { StoryComposerUploadResolution.failed(StoryComposerUploadReducer.queued(it, cmid, item, asBackground, index), cmid) }
    }

    private fun releaseUnqueued(items: List<MediaUploadItem>) =
        items.filter { item -> state.value.pendingUploads.none { it.item === item } }.forEach(MediaIntake::release)
}
