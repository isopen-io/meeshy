package me.meeshy.sdk.model.composer.timeline

/**
 * Qui est surligné, qui est inspecté, qui est en train d'être glissé (miroir de `ClipSelectionState.swift`).
 *
 * Valeur immuable passée telle quelle aux feuilles de l'écran : aucune observation ne se déclenche
 * par la lecture. Le SURLIGNAGE (un tap) et l'INSPECTION (un double tap, la fiche d'édition) sont
 * deux états : sélectionner n'ouvre jamais la fiche, qui recouvrirait la timeline qu'on lit.
 *
 * Invariant : `inspectedClipId != null` implique `inspectedClipId == selectedClipId`.
 */
data class ClipSelectionState(
    val selectedClipId: String? = null,
    val inspectedClipId: String? = null,
    val activeDrag: ActiveDrag? = null,
) {

    /** À quoi le bord glissé s'est accroché : ce qui fait sentir l'aimant. */
    enum class SnappedKind { PLAYHEAD, CLIP_START, CLIP_END, KEYFRAME, GRID }

    data class ActiveDrag(
        val clipId: String,
        val originalStartTime: Float,
        val currentStartTime: Float,
        val snappedTo: SnappedKind? = null,
    )

    val isDragging: Boolean get() = activeDrag != null

    fun isSelected(clipId: String): Boolean = selectedClipId == clipId

    /** Surligne un clip et referme la fiche ouverte (elle resterait posée sur un clip qu'on ne regarde plus). */
    fun select(clipId: String): ClipSelectionState = copy(selectedClipId = clipId, inspectedClipId = null)

    /** Ouvre la fiche d'un clip, en le surlignant. */
    fun inspect(clipId: String): ClipSelectionState = copy(selectedClipId = clipId, inspectedClipId = clipId)

    /** Referme la fiche SANS désélectionner : l'utilisateur retrouve sa piste surlignée. */
    fun endInspection(): ClipSelectionState = copy(inspectedClipId = null)

    fun deselect(): ClipSelectionState = copy(selectedClipId = null, inspectedClipId = null)

    fun beginDrag(clipId: String, originalStartTime: Float): ClipSelectionState =
        copy(activeDrag = ActiveDrag(clipId, originalStartTime, originalStartTime, null))

    fun updateDrag(currentStartTime: Float, snappedTo: SnappedKind?): ClipSelectionState =
        copy(activeDrag = activeDrag?.copy(currentStartTime = currentStartTime, snappedTo = snappedTo))

    fun endDrag(): ClipSelectionState = copy(activeDrag = null)
}
