package me.meeshy.sdk.model.relation

import kotlin.math.abs
import kotlin.math.max

/** Comment ce lecteur rejoint la position servie. */
public sealed interface TogetherCorrection {
    public data object None : TogetherCorrection
    public data class Rate(val rate: Double) : TogetherCorrection
    public data class Seek(val toMs: Double) : TogetherCorrection
}

public enum class TogetherGesture { PLAY, PAUSE, SEEK }

public enum class TogetherGestureEffect {
    /** Le geste change l'état partagé : il part chez l'autre. */
    SEND,

    /** Il ne fait que réaligner CE lecteur sur la séance. */
    ALIGN,
}

/**
 * LA LOI DE SYNCHRONISATION DE « ENSEMBLE » (#17100) — portage À L'IDENTIQUE de `apps/web/src/lib/together/together-sync.ts`
 * et de `TogetherSync.swift` (mêmes seuils, mêmes cas) : pure, sans horloge ni lecteur.
 *
 * - La position COURANTE vaut `positionMs + (horloge serveur − at)` en lecture, `positionMs` en pause ; une horloge locale
 *   en retard ne la fait jamais reculer.
 * - L'écart d'horloge serveur − local garde le plus grand échantillon : la latence ne fait que le sous-estimer.
 * - Une petite dérive se rattrape par la vitesse (±5 %), au-delà d'une seconde par un saut ; en pause, par un saut seul.
 */
public object TogetherSync {
    private const val NUDGE_FROM_MS = 150.0
    private const val SEEK_FROM_MS = 1_000.0
    private const val PAUSED_TOLERANCE_MS = 100.0
    private const val NUDGE = 0.05

    public fun servedPositionMs(playback: TogetherPlayback, serverNowMs: Double): Double =
        if (playback.playing) playback.positionMs + max(0.0, serverNowMs - playback.at) else playback.positionMs

    public fun estimateClockOffset(current: Double?, serverAt: Double, localAt: Double): Double {
        val measured = serverAt - localAt
        return if (current == null) measured else max(current, measured)
    }

    public fun correction(localMs: Double, targetMs: Double, playing: Boolean): TogetherCorrection {
        val drift = localMs - targetMs
        val distance = abs(drift)
        if (!playing) return if (distance > PAUSED_TOLERANCE_MS) TogetherCorrection.Seek(targetMs) else TogetherCorrection.None
        if (distance >= SEEK_FROM_MS) return TogetherCorrection.Seek(targetMs)
        if (distance >= NUDGE_FROM_MS) return TogetherCorrection.Rate(if (drift < 0) 1 + NUDGE else 1 - NUDGE)
        return TogetherCorrection.None
    }

    /** Un geste fait ICI ne part chez l'autre que s'il CHANGE l'état partagé : lecture ↔ pause, ou un saut d'une seconde. */
    public fun effect(gesture: TogetherGesture, localMs: Double, targetMs: Double, sharedPlaying: Boolean): TogetherGestureEffect =
        when (gesture) {
            TogetherGesture.PLAY -> if (sharedPlaying) TogetherGestureEffect.ALIGN else TogetherGestureEffect.SEND
            TogetherGesture.PAUSE -> if (sharedPlaying) TogetherGestureEffect.SEND else TogetherGestureEffect.ALIGN
            TogetherGesture.SEEK -> if (abs(localMs - targetMs) >= SEEK_FROM_MS) TogetherGestureEffect.SEND else TogetherGestureEffect.ALIGN
        }
}
