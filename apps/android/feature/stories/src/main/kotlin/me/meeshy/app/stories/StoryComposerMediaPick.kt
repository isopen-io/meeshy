package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.composer.ComposerMediaPlacement

/**
 * Le chemin d'un choix de médias jusqu'à la scène (R4 et R5 de #13863, #15598) : chacun prend la place que
 * [StoryComposerUploadReducer] lui donne. Seule la PRÉPARATION sur l'appareil (copie des fichiers choisis) retient
 * l'écran derrière l'espace réservé, et ✕ l'annule en rendant tout dans la même image — comme iOS, qui finit l'ajout
 * avant tout envoi (`finishSceneIntake`). Prêt, chaque média se pose sous son `cmid` et [StoryComposerBackgroundUploads]
 * envoie ses octets en arrière-plan. Un second choix pendant une préparation est ignoré.
 */
internal class StoryComposerMediaPick(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<StoryComposerUiState>,
    private val uploads: StoryComposerBackgroundUploads,
    private val ids: ComposerMediaIds,
    private val record: () -> Unit,
) {
    private class Pick(val items: List<MediaUploadItem>, val asBackground: Boolean, val replacing: String? = null)

    private var generation = 0

    /** Des médias déjà prêts sur l'appareil (capture, porte d'entrée) : ils se posent aussitôt. */
    fun pick(items: List<MediaUploadItem>, asBackground: Boolean, replacing: String? = null) {
        if (items.isEmpty()) return
        if (state.value.intakeBlocks) return items.forEach(MediaIntake::release)
        land(Pick(items, asBackground, replacing.takeIf { asBackground }))
    }

    /**
     * [count] fichiers choisis que [prepare] copie sur l'appareil : leur espace réservé retient l'écran le temps de la copie,
     * et montre dès le choix ce que [hints] en disent — vidéo ou image, la vignette d'une photo (#16205).
     */
    fun choose(
        count: Int,
        asBackground: Boolean,
        replacing: String?,
        hints: List<IncomingMediaHint> = emptyList(),
        prepare: suspend () -> List<MediaUploadItem>,
    ) {
        val current = state.value
        if (count <= 0 || current.intakeBlocks) return
        val landings = StoryComposerUploadReducer.landings(current, count, asBackground)
        if (refusesForLimit(current, landings)) return
        state.update { StoryComposerUploadReducer.started(it, landings, hints = hints) }
        val mine = ++generation
        scope.launch {
            val items = try {
                prepare()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                emptyList()
            }
            if (mine != generation) return@launch items.forEach(MediaIntake::release)
            state.update(StoryComposerUploadReducer::settled)
            if (items.isEmpty()) return@launch state.update { it.copy(errorMessage = StoryComposerViewModel.MEDIA_FAILED) }
            land(Pick(items, asBackground, replacing.takeIf { asBackground }))
        }
    }

    /** ✕ pendant la préparation : l'espace réservé part et l'écran se libère dans la même image ; la copie qui finit est rendue. */
    fun cancel() {
        if (!state.value.isPreparingMedia) return
        generation++
        state.update(StoryComposerUploadReducer::settled)
    }

    private fun refusesForLimit(current: StoryComposerUiState, landings: List<ComposerMediaPlacement.Landing>): Boolean {
        if (landings.none { !it.newSlide } || current.deck.selectedRemainingMediaSlots > 0) return false
        state.update { it.copy(errorMessage = StoryComposerViewModel.MEDIA_LIMIT) }
        return true
    }

    private fun land(pick: Pick) {
        val current = state.value
        val landings = StoryComposerUploadReducer.landings(current, pick.items.size, pick.asBackground)
        if (refusesForLimit(current, landings)) return pick.items.forEach(MediaIntake::release)
        val accepted = pick.items.take(landings.size)
        pick.items.drop(landings.size).forEach(MediaIntake::release)
        val named = accepted.map { ids.next() to it }
        state.update { start ->
            val planned = start.copy(
                mediaLandings = landings,
                errorMessage = StoryComposerUploadReducer.SLIDES_FULL.takeIf { accepted.size < pick.items.size },
            )
            val posed = named.foldIndexed(planned) { index, acc, (cmid, item) ->
                StoryComposerUploadReducer.queued(acc, cmid, item, pick.asBackground, index)
            }
            StoryComposerUploadReducer.settled(posed)
        }
        pick.replacing?.let { old -> state.update { StoryComposerBackgroundSelectionReducer.retired(it, old) } }
        record()
        uploads.send(named.map { (cmid, item) -> PendingMediaUpload(cmid, item) })
    }
}
