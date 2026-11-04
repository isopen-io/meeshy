package me.meeshy.app.stories

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.UploadedMedia

/**
 * L'arrivée d'un sticker IMAGE dans la scène (#15597, iOS `poseStickerChoice` → `beginSceneIntake(.sticker, …)`) : il se
 * pose aussitôt avec son aperçu, et tant que ses octets s'envoient [StickerIntake] retient l'écran — aucun second ajout,
 * Publier retenu. ✕ l'annule dans la même image ; un échec le retire, libère l'écran et garde la pose pour « Réessayer ».
 * Ce qu'une image devient au fil de l'annuler/rétablir reste l'affaire de [StickerImageUploads].
 */
internal class StoryComposerStickerIntake(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<StoryComposerUiState>,
    private val images: StickerImageUploads,
    private val send: suspend (StickerImagePose) -> UploadedMedia?,
    private val pose: (StoryStickerElement) -> Unit,
) {
    private var job: Job? = null
    private var failedPose: StickerImagePose? = null

    fun add(choice: StickerImagePose, id: String) {
        if (state.value.intakeBlocks) return
        giveUpRetry()
        pose(choice.awaiting(id))
        if (state.value.deck.selectedSlide.stickers.none { it.id == id }) return
        images.started(id)
        state.update { it.copy(stickerIntake = StickerIntake(id)) }
        job = scope.launch {
            val uploaded = send(choice)
            images.settled(id, uploaded)
            if (uploaded == null) failedPose = choice
            state.update { current -> settled(current, id, uploaded) }
        }
    }

    /** ✕ : l'envoi s'arrête et le sticker part ; sur un échec, ✕ renonce à le renvoyer. */
    fun cancel() {
        val intake = state.value.stickerIntake ?: return
        job?.cancel()
        job = null
        if (!intake.failed) images.settled(intake.stickerId, null)
        giveUpRetry()
        state.update { current ->
            images.reconciled(current).copy(stickerIntake = null, errorMessage = current.errorMessage.takeUnless { it == StoryComposerViewModel.STICKER_IMAGE_FAILED })
        }
    }

    /** « Réessayer » : la même pose repart, sous un nouvel identifiant, à la place que la scène lui donne maintenant. */
    fun retry(id: String) {
        val choice = failedPose ?: return
        failedPose = null
        state.update { it.copy(stickerIntake = null, errorMessage = null) }
        add(choice, id)
    }

    private fun settled(current: StoryComposerUiState, id: String, uploaded: UploadedMedia?): StoryComposerUiState {
        if (uploaded != null) return images.reconciled(current).copy(stickerIntake = null)
        return images.reconciled(StoryComposerStickerReducer.imageFailed(current, id)).copy(stickerIntake = StickerIntake(id, failed = true))
    }

    private fun giveUpRetry() {
        failedPose = null
        if (state.value.stickerIntake?.failed == true) state.update { it.copy(stickerIntake = null) }
    }
}
