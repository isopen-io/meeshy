package me.meeshy.sdk.model.composer.timeline

/**
 * Source de vérité UNIQUE des bornes d'une fenêtre de clip sur la timeline
 * (miroir de `ClipWindowResolver.swift`).
 *
 * Règle : `start >= 0`, `duration >= MINIMUM_DURATION`, `start + duration <= MAXIMUM_END`.
 * Aucune borne sur la durée de slide : elle dérive du contenu, c'est le clip qui
 * l'étend, jamais elle qui le contraint.
 */
object ClipWindowResolver {

    data class Window(val start: Float, val duration: Float) {
        val end: Float get() = start + duration
    }

    /** Intention d'édition : chaque cas dit ce qui reste FIXE. */
    sealed interface Edit {
        /** La durée reste fixe. */
        data class Move(val to: Float) : Edit

        /** La fin reste fixe. */
        data class SetStart(val value: Float) : Edit

        /** Le début reste fixe. */
        data class SetEnd(val value: Float) : Edit

        /** Le début reste fixe. */
        data class SetDuration(val value: Float) : Edit
    }

    /** Durée plancher d'un clip — en deçà il ne serait plus saisissable. */
    const val MINIMUM_DURATION: Float = 0.05f

    /** Plafond absolu de la timeline. */
    const val MAXIMUM_END: Float = 600f

    fun resolve(edit: Edit, from: Window): Window {
        if (!from.start.isFinite() || !from.duration.isFinite() || !valueOf(edit).isFinite()) return from
        return when (edit) {
            is Edit.Move -> {
                val start = maxOf(0f, minOf(edit.to, MAXIMUM_END - from.duration))
                Window(start, from.duration)
            }
            is Edit.SetStart -> {
                val end = from.end
                val start = maxOf(0f, minOf(edit.value, end - MINIMUM_DURATION))
                Window(start, end - start)
            }
            is Edit.SetEnd -> {
                val end = maxOf(from.start + MINIMUM_DURATION, minOf(edit.value, MAXIMUM_END))
                Window(from.start, end - from.start)
            }
            is Edit.SetDuration -> {
                val duration = maxOf(MINIMUM_DURATION, minOf(edit.value, MAXIMUM_END - from.start))
                Window(from.start, duration)
            }
        }
    }

    private fun valueOf(edit: Edit): Float = when (edit) {
        is Edit.Move -> edit.to
        is Edit.SetStart -> edit.value
        is Edit.SetEnd -> edit.value
        is Edit.SetDuration -> edit.value
    }
}
