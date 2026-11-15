package me.meeshy.app.stories

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.StoryDraftAnnotations

/**
 * Qui écrit le brouillon de la scène, et quand (#13869, iOS `ComposerAutosaveController`) : chaque modification de ce que le
 * brouillon garde réarme une attente, et seule l'accalmie écrit — un geste de scène émet un état par image, il n'écrit qu'une
 * fois lâché. La mort du processus ne passe ni par la fermeture ni par `onDispose` : sans cette écriture, tout ce qui avait
 * changé depuis la dernière fermeture était perdu. Une publication en cours n'écrit rien : elle tient son propre brouillon,
 * marqué comme attendant ses stories (#13417).
 */
internal object StoryComposerAutosaveWatch {
    const val DEBOUNCE_MS: Long = 1_200L

    private data class Persisted(
        val deck: StorySlideDeck,
        val visibility: StoryVisibility,
        val repostOfId: String?,
        val visibilityUserIds: List<String>,
        val annotations: StoryDraftAnnotations,
        val format: StoryDraftFormat,
    )

    private fun StoryComposerUiState.persisted() = Persisted(
        deck = deck,
        visibility = draft.visibility,
        repostOfId = draft.repostOfId,
        visibilityUserIds = draft.visibilityUserIds,
        annotations = draft.annotations(),
        format = formatDraft(),
    )

    /** Veille [state] une fois [after] (la restauration) terminée ; ce qu'elle a relu n'est pas une modification. */
    @OptIn(FlowPreview::class)
    fun start(scope: CoroutineScope, after: Job?, state: StateFlow<StoryComposerUiState>, persist: () -> Unit): Job = scope.launch {
        after?.join()
        state.map { it.persisted() }
            .distinctUntilChanged()
            .drop(1)
            .debounce(DEBOUNCE_MS)
            .collect { if (!state.value.isPublishing) persist() }
    }
}
