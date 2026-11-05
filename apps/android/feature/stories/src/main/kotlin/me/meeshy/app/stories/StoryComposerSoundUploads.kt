package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.net.NetworkResult

/**
 * L'envoi de fond d'un son POSÉ (#15598, iOS `startPendingPreUploads` après la pose d'un son) : la feuille Son remet le
 * son prêt sur l'appareil, il se pose aussitôt sous son adresse locale, et ses octets partent sans rien retenir — sa part
 * envoyée se lit dans [StoryComposerUiState.uploadProgress]. Reçu, il prend son média servi ([onReceived]) ; un échec le
 * garde, le dit et propose « Réessayer ». Publier attend ses sons ([awaitsSoundUpload]) : une piste ne part qu'avec son
 * adresse servie.
 */
internal class StoryComposerSoundUploads(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<StoryComposerUiState>,
    private val uploader: StoryMediaUploader,
    private val onReceived: (trackId: String, media: UploadedMedia) -> Unit,
) {
    private val items = mutableMapOf<String, MediaUploadItem>()
    private val jobs = mutableMapOf<String, Job>()

    fun send(trackId: String, item: MediaUploadItem) {
        items[trackId] = item
        start(trackId)
    }

    fun retryFailed() = state.value.failedSounds.forEach(::start)

    /** Le composeur se ferme : les envois s'arrêtent, les fichiers locaux sont rendus. */
    fun cleared() {
        jobs.values.forEach(Job::cancel)
        jobs.clear()
        items.values.forEach(::discard)
        items.clear()
    }

    private fun start(trackId: String) {
        val item = items[trackId] ?: return
        if (trackId in jobs) return
        state.update {
            it.copy(
                uploadProgress = it.uploadProgress + (trackId to MediaUploadProgress.Idle),
                failedSounds = it.failedSounds - trackId,
                errorMessage = it.errorMessage.takeUnless { message -> message == StoryComposerViewModel.SOUND_FAILED },
            )
        }
        val job = scope.launch(start = CoroutineStart.LAZY) {
            val media = upload(trackId, item)
            jobs.remove(trackId)
            state.update { it.copy(uploadProgress = it.uploadProgress - trackId) }
            if (media == null) return@launch state.update { it.copy(failedSounds = it.failedSounds + trackId, errorMessage = StoryComposerViewModel.SOUND_FAILED) }
            items.remove(trackId)
            onReceived(trackId, media)
            discard(item)
        }
        jobs[trackId] = job
        job.start()
    }

    private suspend fun upload(trackId: String, item: MediaUploadItem): UploadedMedia? = try {
        val result = uploader.upload(listOf(item)) { _, sent, total ->
            state.update { it.copy(uploadProgress = it.uploadProgress + (trackId to MediaUploadProgress.Uploading(sent, total))) }
        }
        (result as? NetworkResult.Success)?.data?.firstOrNull()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        null
    }

    private fun discard(item: MediaUploadItem) {
        MediaIntake.release(item)
        (item.source as? MediaUploadSource.OnDisk)?.file?.delete()
    }
}

/** La piste [trackId] prend son média servi, sur chaque diapo qui la porte (#15598). */
internal fun StorySlideDeck.withSoundServed(trackId: String, media: UploadedMedia): StorySlideDeck =
    copy(slides = slides.map { slide -> slide.copy(audio = slide.audio.map { if (it.id == trackId) it.copy(postMediaId = media.id, mediaURL = media.url) else it }) })

/** Une piste posée dont les octets ne sont pas encore reçus : elle se joue sur l'appareil, elle ne se garde pas en brouillon. */
internal val StoryAudioPlayerObject.awaitsUpload: Boolean
    get() = postMediaId.isBlank() && mediaURL.orEmpty().startsWith(LOCAL_SCHEME)

private const val LOCAL_SCHEME = "file:"
