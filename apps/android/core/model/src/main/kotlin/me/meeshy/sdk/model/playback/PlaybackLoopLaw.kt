package me.meeshy.sdk.model.playback

/**
 * **Ce qu'une barre de lecture affiche pour un média qui boucle** (iOS `PlaybackProgressLaw`, #10555).
 * Une seule source : le temps de l'ÉLÉMENT en cours et sa durée, jamais un temps cumulé.
 */
public object PlaybackProgressLaw {

    /** La part de la barre remplie, dans `0..1`. Durée inconnue : zéro. */
    public fun fraction(itemSeconds: Double, durationSeconds: Double): Double {
        if (!durationSeconds.isFinite() || durationSeconds <= 0.0 || !itemSeconds.isFinite()) return 0.0
        return (itemSeconds / durationSeconds).coerceIn(0.0, 1.0)
    }

    /**
     * La durée à publier quand l'élément en cours rapporte la sienne. Le successeur de boucle est le
     * MÊME média : tant qu'il n'a pas relu sa durée, celle du tour précédent tient.
     */
    public fun heldDuration(reported: Double, known: Double, isLoopSuccessor: Boolean): Double {
        if (reported.isFinite() && reported > 0.0) return reported
        if (!isLoopSuccessor || !known.isFinite() || known <= 0.0) return 0.0
        return known
    }

    /** La tête publiée dès qu'un déplacement est demandé : la cible, bornée au média. */
    public fun headAfterSeek(target: Double, durationSeconds: Double): Double {
        if (!target.isFinite()) return 0.0
        val floor = maxOf(0.0, target)
        if (!durationSeconds.isFinite() || durationSeconds <= 0.0) return floor
        return minOf(floor, durationSeconds)
    }
}

/** Ce que le moteur fait quand l'élément d'un média en boucle se termine (iOS `PlaybackLoopTurn`). */
public object PlaybackLoopTurn {

    public enum class Action {
        /** Le successeur est en file et la file n'a pas encore enchaîné : elle le fera seule. */
        AWAIT_QUEUE_ADVANCE,

        /** Aucun successeur : la tête de l'élément fini revient au début. */
        REWIND_CURRENT_ITEM,

        /** La file a déjà enchaîné sur le successeur. */
        ALREADY_ADVANCED,
    }

    public fun action(finishedIsCurrent: Boolean, successorQueued: Boolean): Action = when {
        !finishedIsCurrent -> Action.ALREADY_ADVANCED
        successorQueued -> Action.AWAIT_QUEUE_ADVANCE
        else -> Action.REWIND_CURRENT_ITEM
    }
}
