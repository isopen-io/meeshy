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
 * la même image. Un échec ou un refus de la passerelle se met en file DURABLE derrière un espace réservé « en attente »
 * (#13417) — hors ligne, rien ne bloque ; une erreur qu'aucune file ne reprend garde les octets pour « Réessayer », et les
 * rend dès que ce nouvel essai n'a plus lieu (autre choix, composeur quitté). Un second choix pendant un envoi est ignoré.
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
            val result = uploader.upload(pick.items, onProgress)
            currentCoroutineContext().ensureActive()
            when (result) {
                is NetworkResult.Success -> { applyUploaded(result.data, pick.asBackground); pick.items.forEach(MediaIntake::release) }
                is NetworkResult.Failure -> if (StoryComposerUploadReducer.refusesForLocation(result.error)) {
                    pick.items.forEach(MediaIntake::release)
                    state.update(StoryComposerUploadReducer::locationRefused)
                } else {
                    queueDurably(pick)
                }
            }
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

    private fun applyUploaded(uploaded: List<UploadedMedia>, asBackground: Boolean) {
        state.update { StoryComposerUploadReducer.uploaded(it, uploaded, asBackground) }
        if (uploaded.isNotEmpty()) record()
    }

    /** Any failed upload (a refusal included, #13417) is queued durably: its blob and outbox row share the `cmid` that rides in the draft as a placeholder id. */
    private suspend fun queueDurably(pick: Pick) {
        pick.items.forEachIndexed { index, item ->
            val cmid = queue.enqueue(item, context = TusUploadContext.STORY)
            state.update { StoryComposerUploadReducer.queued(it, cmid, item, pick.asBackground, index) }
            record()
        }
        state.update(StoryComposerUploadReducer::settled)
    }

    private fun releaseUnqueued(items: List<MediaUploadItem>) =
        items.filter { item -> state.value.pendingUploads.none { it.item === item } }.forEach(MediaIntake::release)
}
