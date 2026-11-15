package me.meeshy.sdk.model.fullscreen

import kotlin.math.abs

/** Par quelle PORTE on entre en plein cadre : on s'arrête sur ce qu'on regarde (appui long), on se laisse porter par ce qu'on écoute (glissement), le tap est le geste sans intention. */
public enum class StageEntry { Tap, LongPress, SwipeUp }

/** Ce que la porte commande à la LECTURE, à part ce qu'elle commande au cadrage. */
public enum class StageTransportIntent { None, Pause, TogglePlayback }

/**
 * L'état d'immersion de la lecture, un seul et partagé (miroir de `StagePresentation.swift`) : il pilote la géométrie
 * (cadre arrondi centré avec plateau autour, puis coins droits en plein cadre) et porte la RAISON de l'entrée.
 */
public sealed interface StagePresentation {
    public data object Carded : StagePresentation {
        override val pausedOnEntry: Boolean get() = false
    }
    public data class Full(override val pausedOnEntry: Boolean) : StagePresentation

    public val isFull: Boolean get() = this is Full
    public val pausedOnEntry: Boolean
    public val showsPlateau: Boolean get() = !isFull
    public val framing: MediaStageFraming.Presentation
        get() = if (isFull) MediaStageFraming.Presentation.Full else MediaStageFraming.Presentation.Carded

    /** Un SEUL point d'écriture par porte : tap bascule, appui long entre en pause, glissement vers le haut entre en lecture. */
    public fun after(door: StageEntry): StagePresentation = when (door) {
        StageEntry.LongPress -> Full(pausedOnEntry = true)
        StageEntry.Tap -> if (isFull) Carded else Full(pausedOnEntry = false)
        StageEntry.SwipeUp -> if (isFull) this else Full(pausedOnEntry = false)
    }

    public companion object {
        /** Seul l'appui long commande la lecture : pause en entrant, bascule une fois dedans (réversible sans sortir). */
        public fun transportIntent(door: StageEntry, current: StagePresentation): StageTransportIntent = when {
            door != StageEntry.LongPress -> StageTransportIntent.None
            current.isFull -> StageTransportIntent.TogglePlayback
            else -> StageTransportIntent.Pause
        }
    }
}

/** La pastille « En pause » : seulement après une entrée par appui long, sur un média lisible à l'arrêt. */
public object MediaStagePause {
    public fun showsBadge(presentation: StagePresentation, isPlayable: Boolean, isPlaying: Boolean): Boolean =
        presentation.pausedOnEntry && isPlayable && !isPlaying
}

/** Le verdict d'un glissement vertical sur la scène. */
public object MediaStageGestures {
    public enum class DragOutcome { Ignored, Follows, Dismisses, EntersFull }

    public fun resolveDrag(dx: Float, dy: Float, presentation: StagePresentation, threshold: Float): DragOutcome = when {
        abs(dy) <= abs(dx) -> DragOutcome.Ignored
        dy <= -threshold && !presentation.isFull -> DragOutcome.EntersFull
        dy >= threshold -> DragOutcome.Dismisses
        else -> DragOutcome.Follows
    }

    /** L'appui long n'est armé que sur la page active et non zoomée. */
    public fun longPressArmed(isActive: Boolean, isTransformed: Boolean): Boolean = isActive && !isTransformed
}
