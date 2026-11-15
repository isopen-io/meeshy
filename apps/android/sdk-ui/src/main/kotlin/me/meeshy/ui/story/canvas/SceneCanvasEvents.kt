package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Immutable

/**
 * Ce que le canevas remonte à son hôte ; tout est facultatif, le lecteur seul n'écoute rien. En ÉDITION le composeur écoute
 * les gestes sur les objets (miroir des callbacks de `StoryCanvasUIView`) ; les objets sont désignés par leur id.
 */
@Immutable
public data class SceneCanvasEvents(
    /** Une image de fond ou de média a fini de se résoudre (succès ou échec) : l'hôte arrête d'attendre. */
    val onImageResolved: (String) -> Unit = {},
    /** Un tap sur l'objet [id]. */
    val onItemTapped: ((id: String) -> Unit)? = null,
    /** Un double-tap sur l'objet [id] : son éditeur. */
    val onItemDoubleTapped: ((id: String) -> Unit)? = null,
    /** Un geste a modifié l'objet [id] ; la pose finale (x, y en fraction du cadre, échelle, rotation en degrés) part au lâcher. */
    val onItemModified: ((id: String, x: Double, y: Double, scale: Double, rotation: Double) -> Unit)? = null,
    /** Un appui long sur l'objet [id] : son menu. */
    val onItemMenuRequested: ((id: String) -> Unit)? = null,
    /** Tout ce que la scène attendait (images, vidéos) est résolu : elle est prête à être vue. */
    val onContentReady: (() -> Unit)? = null,
    /** La tête de lecture de la scène, en secondes. */
    val onPlaybackTime: ((seconds: Double) -> Unit)? = null,
) {
    /** Vrai dès qu'un hôte écoute un geste sur les objets : la scène est en ÉDITION. */
    public val isEditing: Boolean
        get() = onItemTapped != null || onItemDoubleTapped != null || onItemModified != null || onItemMenuRequested != null

    public companion object {
        public val None: SceneCanvasEvents = SceneCanvasEvents()
    }
}
