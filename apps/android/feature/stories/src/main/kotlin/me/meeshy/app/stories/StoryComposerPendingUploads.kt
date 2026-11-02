package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.NetworkResult

/**
 * Ce qu'un média en file d'envoi DIT (#13959) : « Hors ligne » seulement sans réseau ; en ligne il repart seul et le dit
 * (« Envoi… »), ou son dernier essai a échoué et il propose « Réessayer ». Aucun état d'attente ne reste figé en ligne.
 */
internal enum class PendingUploadPhase { OFFLINE, SENDING, FAILED }

internal fun StoryComposerUiState.pendingPhase(cmid: String): PendingUploadPhase = when {
    isOffline -> PendingUploadPhase.OFFLINE
    cmid in failedUploads && cmid !in resendingUploads -> PendingUploadPhase.FAILED
    else -> PendingUploadPhase.SENDING
}

/** La phase du fond de la diapo choisie quand il attend sa file, `null` sinon. */
internal val StoryComposerUiState.selectedSlideBackdropPendingPhase: PendingUploadPhase?
    get() = selectedSlideBackdropMediaId?.takeIf { selectedSlideBackdropIsPending }?.let(::pendingPhase)

/**
 * La vie d'un média en file pendant la composition (#13959), pure : il repart ([resending]), échoue ([failed]) ou est REÇU
 * ([resolved]) — il devient alors un média envoyé ordinaire, sous l'identifiant que la passerelle lui a donné, partout où
 * la composition le nommait (diapos, fond, objets posés, looks, description, légende, sélection) et dans chaque étape de
 * l'annuler/rétablir ([resolvedSnapshot]) : rien ne le renomme à moitié.
 */
internal object StoryComposerUploadResolution {

    fun resending(state: StoryComposerUiState, cmid: String): StoryComposerUiState =
        state.copy(resendingUploads = state.resendingUploads + cmid, failedUploads = state.failedUploads - cmid)

    fun failed(state: StoryComposerUiState, cmid: String): StoryComposerUiState {
        val next = state.copy(resendingUploads = state.resendingUploads - cmid, failedUploads = state.failedUploads + cmid)
        return if (next.isOffline) next else next.copy(errorMessage = StoryComposerViewModel.MEDIA_FAILED, canRetryMedia = true)
    }

    /** [cmid] est reçu sous [media] ; un envoi que la composition ne montre plus (retiré, publié entre-temps) ne change rien. */
    fun resolved(state: StoryComposerUiState, cmid: String, media: UploadedMedia): StoryComposerUiState {
        val settled = state.copy(resendingUploads = state.resendingUploads - cmid, failedUploads = state.failedUploads - cmid)
        if (settled.pendingUploads.none { it.cmid == cmid }) return settled
        val stillFailing = settled.failedUploads.isNotEmpty()
        return settled.copy(
            deck = settled.deck.renamedMedia(cmid, media.id),
            attachments = settled.attachments + media,
            pendingUploads = settled.pendingUploads.filterNot { it.cmid == cmid },
            selectedMediaId = settled.selectedMediaId?.let { if (it == cmid) media.id else it },
            draft = settled.draft.copy(
                mediaAlt = settled.draft.mediaAlt.renamedKey(cmid, media.id),
                mediaCaption = settled.draft.mediaCaption.renamedKey(cmid, media.id),
            ),
            errorMessage = settled.errorMessage.takeUnless { it == StoryComposerViewModel.MEDIA_FAILED && !stillFailing },
            canRetryMedia = settled.canRetryMedia && stillFailing,
        ).mirrorDraftToSelection()
    }

    fun resolvedSnapshot(snapshot: ComposerSnapshot, cmid: String, media: UploadedMedia): ComposerSnapshot {
        if (snapshot.deck.slides.none { cmid in it.mediaIds }) return snapshot
        return ComposerSnapshot(snapshot.deck.renamedMedia(cmid, media.id), snapshot.attachments + media)
    }

    private fun <V> Map<String, V>.renamedKey(from: String, to: String): Map<String, V> =
        get(from)?.let { value -> (this - from) + (to to value) } ?: this
}

/** Chaque mention de [from] dans le deck devient [to] : liste des médias, fond, objets posés et leurs looks. */
internal fun StorySlideDeck.renamedMedia(from: String, to: String): StorySlideDeck {
    fun moved(id: String): String = if (id == from) to else id
    return copy(
        slides = slides.map { slide ->
            slide.copy(
                mediaIds = slide.mediaIds.map(::moved),
                backgroundMediaId = slide.backgroundMediaId?.let(::moved),
                placedMedia = slide.placedMedia.map { it.copy(mediaId = moved(it.mediaId), id = moved(it.id)) },
                mediaLooks = slide.mediaLooks.mapKeys { moved(it.key) },
            )
        },
    )
}

/**
 * Relance les médias en file pendant que le composeur est ouvert (#13959) : seuls au retour du réseau, et à la demande
 * (« Réessayer », toucher la vignette). Un envoi reçu remplace son espace réservé là où il est ([onResolved] : l'état, son
 * historique et la file durable), dans la même image ; un échec se dit, ses octets restent dans la file.
 */
internal class StoryComposerPendingRetry(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<StoryComposerUiState>,
    private val uploader: StoryMediaUploader,
    private val onResolved: (cmid: String, media: UploadedMedia) -> Unit,
) {
    fun watch(online: StateFlow<Boolean>) {
        scope.launch {
            online.collect { isOnline ->
                state.update { it.copy(isOffline = !isOnline) }
                if (isOnline) state.value.pendingUploads.forEach { retry(it.cmid) }
            }
        }
    }

    fun retryFailed() = state.value.failedUploads.forEach(::retry)

    fun retry(cmid: String) {
        val current = state.value
        if (current.isOffline || cmid in current.resendingUploads) return
        val pending = current.pendingUploads.firstOrNull { it.cmid == cmid } ?: return
        state.update { StoryComposerUploadResolution.resending(it, cmid) }
        scope.launch {
            val media = try {
                when (val result = uploader.uploadEach(listOf(pending.item)).singleOrNull()) {
                    is NetworkResult.Success -> result.data.firstOrNull()
                    else -> null
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                null
            }
            if (media == null) state.update { StoryComposerUploadResolution.failed(it, cmid) } else onResolved(cmid, media)
        }
    }
}
