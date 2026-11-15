package me.meeshy.sdk.model.recording

import me.meeshy.sdk.model.media.MediaPermissionState

/** Où en est l'enregistreur : prêt, micro ouvert, ou prise terminée en attente d'acceptation. */
public enum class RecorderPhase { READY, RECORDING, PREVIEW }

/** Pourquoi le micro n'est pas utilisable : refus simple, ou seul le réglage de l'app peut encore l'ouvrir. */
public enum class MicRefusal { DENIED, NEEDS_SETTINGS }

/** Le retour tactile qu'une transition demande ; l'écran le joue (miroir de `HapticFeedback.medium/success`). */
public enum class RecorderHaptic { MEDIUM, SUCCESS }

public data class RecorderScreenState(
    val phase: RecorderPhase = RecorderPhase.READY,
    val refusal: MicRefusal? = null,
) {
    val isRecording: Boolean get() = phase == RecorderPhase.RECORDING
    val isPreviewing: Boolean get() = phase == RecorderPhase.PREVIEW
}

public sealed interface RecorderScreenEvent {
    /** La demande de micro a répondu avec [state]. */
    public data class PermissionResolved(val state: MediaPermissionState) : RecorderScreenEvent

    /** L'enregistreur a ouvert (ou refusé d'ouvrir) le micro. */
    public data class Started(val live: Boolean) : RecorderScreenEvent

    /** La prise est terminée ; [kept] est faux quand elle était trop courte. */
    public data class Finished(val kept: Boolean) : RecorderScreenEvent

    public data object Cancelled : RecorderScreenEvent

    /** Depuis l'aperçu : refaire la prise. */
    public data object Redo : RecorderScreenEvent
}

public data class RecorderTransition(val state: RecorderScreenState, val haptic: RecorderHaptic? = null)

/**
 * La machine d'états de l'enregistreur plein écran (iOS `UniversalAudioRecorderView`) : un refus de micro
 * s'explique sous les contrôles au lieu de laisser un écran inerte, un démarrage vivant vibre moyen, une
 * prise gardée vibre en succès et ouvre l'aperçu.
 */
public object AudioRecorderScreenLaw {

    public fun reduce(state: RecorderScreenState, event: RecorderScreenEvent): RecorderTransition = when (event) {
        is RecorderScreenEvent.PermissionResolved -> RecorderTransition(
            state.copy(refusal = refusalOf(event.state)),
        )
        is RecorderScreenEvent.Started ->
            if (event.live && state.phase == RecorderPhase.READY) {
                RecorderTransition(RecorderScreenState(RecorderPhase.RECORDING), RecorderHaptic.MEDIUM)
            } else {
                RecorderTransition(state.copy(phase = RecorderPhase.READY))
            }
        is RecorderScreenEvent.Finished ->
            if (state.phase != RecorderPhase.RECORDING) {
                RecorderTransition(state)
            } else if (event.kept) {
                RecorderTransition(RecorderScreenState(RecorderPhase.PREVIEW), RecorderHaptic.SUCCESS)
            } else {
                RecorderTransition(RecorderScreenState())
            }
        RecorderScreenEvent.Cancelled, RecorderScreenEvent.Redo -> RecorderTransition(RecorderScreenState())
    }

    private fun refusalOf(state: MediaPermissionState): MicRefusal? = when {
        state.isUsable -> null
        state.needsSettingsRedirect -> MicRefusal.NEEDS_SETTINGS
        else -> MicRefusal.DENIED
    }
}
