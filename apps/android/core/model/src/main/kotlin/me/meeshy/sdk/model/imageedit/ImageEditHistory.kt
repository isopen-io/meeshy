package me.meeshy.sdk.model.imageedit

/** Un pas de l'historique : un instantané complet et son libellé lisible. */
public data class ImageEditHistoryStep(
    val id: Long,
    val state: ImageEditState,
    val label: String,
)

/**
 * Annuler/rétablir par instantanés (curseur + tableau), O(1). Valeur immuable : chaque
 * opération rend un nouvel historique. Session seulement, jeté à la fermeture de l'éditeur.
 * Miroir d'iOS `ImageEditHistory`.
 */
public class ImageEditHistory private constructor(
    public val steps: List<ImageEditHistoryStep>,
    public val cursor: Int,
    private val nextId: Long,
) {
    public constructor(
        initial: ImageEditState = ImageEditState.IDENTITY,
        initialLabel: String = "Original",
    ) : this(listOf(ImageEditHistoryStep(0L, initial, initialLabel)), 0, 1L)

    public val current: ImageEditState get() = steps[cursor].state
    public val currentStepId: Long get() = steps[cursor].id
    public val canUndo: Boolean get() = cursor > 0
    public val canRedo: Boolean get() = cursor < steps.size - 1
    public val count: Int get() = steps.size

    /**
     * Enregistre [state] au curseur ; la branche en avant est rejetée. Un état identique à
     * l'actuel n'est pas enregistré (un glissé qui finit où il a commencé reste hors historique).
     */
    public fun record(state: ImageEditState, label: String): ImageEditHistory {
        if (state == current) return this
        val kept = steps.subList(0, cursor + 1)
        val next = kept + ImageEditHistoryStep(nextId, state, label)
        return ImageEditHistory(next, next.size - 1, nextId + 1)
    }

    public fun undo(): ImageEditHistory? =
        if (canUndo) ImageEditHistory(steps, cursor - 1, nextId) else null

    public fun redo(): ImageEditHistory? =
        if (canRedo) ImageEditHistory(steps, cursor + 1, nextId) else null

    /** Saute au pas [id] ; la branche est préservée jusqu'au prochain `record`. */
    public fun jump(id: Long): ImageEditHistory? {
        val index = steps.indexOfFirst { it.id == id }
        return if (index < 0) null else ImageEditHistory(steps, index, nextId)
    }

    override fun equals(other: Any?): Boolean =
        other is ImageEditHistory && other.steps == steps && other.cursor == cursor

    override fun hashCode(): Int = 31 * steps.hashCode() + cursor
}
