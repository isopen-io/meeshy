package me.meeshy.sdk.model.call.montage

import kotlin.math.max

/** Un geste sur le choix du mode Montage. */
public enum class CallModeGesture { TAP, DOUBLE_TAP, LONG_PRESS }

/** Ce qu'un geste déclenche : choisir, photographier, filmer, ou rien. */
public enum class CallModeGestureOutcome { SELECT, CAPTURE_PHOTO, START_RECORDING, NONE }

/**
 * **LES GESTES DE LA CAPTURE** — portage de `CallModeGestureRule` (`apps/ios/.../Models/CallModeRules.swift`,
 * #8625) : le choix affiché SE déclenche — deux tapes prennent la photo, un appui long filme ; un autre
 * choix se prend d'un simple toucher. Pendant le film, seul le bouton stop l'arrête.
 */
public object CallModeGestureRule {
    public const val LONG_PRESS_MILLIS: Long = 450L

    public fun outcome(gesture: CallModeGesture, isSelected: Boolean, isRecording: Boolean): CallModeGestureOutcome {
        if (!isSelected) return CallModeGestureOutcome.SELECT
        if (isRecording) return CallModeGestureOutcome.NONE
        return when (gesture) {
            CallModeGesture.TAP -> CallModeGestureOutcome.NONE
            CallModeGesture.DOUBLE_TAP -> CallModeGestureOutcome.CAPTURE_PHOTO
            CallModeGesture.LONG_PRESS -> CallModeGestureOutcome.START_RECORDING
        }
    }

    public fun listensForShots(isSelected: Boolean, isRecording: Boolean): Boolean = isSelected && !isRecording

    /**
     * Sur la piste du carrousel (#13733, iOS `CallModeTrackLayout.listens`) : deux tapes et l'appui long n'écoutent
     * que sur l'élément CHOISI, et seulement quand il est au centre ; un élément qui défile ne porte qu'un toucher.
     */
    public fun listensOnTrack(isSelected: Boolean, isCentred: Boolean, isRecording: Boolean): Boolean =
        isCentred && listensForShots(isSelected, isRecording)

    public fun showsHint(hasSeenHint: Boolean, isRecording: Boolean): Boolean = !hasSeenHint && !isRecording

    /** Le chrono du film : `m:ss`, puis `h:mm:ss` passé une heure. */
    public fun clock(elapsedMillis: Long): String {
        val seconds = max(elapsedMillis, 0L) / 1_000
        val hours = seconds / 3_600
        val minutes = (seconds % 3_600) / 60
        val rest = seconds % 60
        return if (hours > 0) "$hours:${pad(minutes)}:${pad(rest)}" else "$minutes:${pad(rest)}"
    }

    private fun pad(value: Long): String = value.toString().padStart(2, '0')
}
