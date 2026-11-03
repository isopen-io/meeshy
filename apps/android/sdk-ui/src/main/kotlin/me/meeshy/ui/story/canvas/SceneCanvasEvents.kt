package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Immutable

/** Ce que le canevas remonte à son hôte ; tout est facultatif, le lecteur seul n'écoute rien. */
@Immutable
public data class SceneCanvasEvents(
    /** Une image de fond ou de média a fini de se résoudre (succès ou échec) : l'hôte arrête d'attendre. */
    val onImageResolved: (String) -> Unit = {},
) {
    public companion object {
        public val None: SceneCanvasEvents = SceneCanvasEvents()
    }
}
