package me.meeshy.ui.story.canvas

/**
 * L'horloge d'apparition d'UN sticker animé (miroir de `StoryStickerMotionClock`, iOS) : le temps écoulé DEPUIS
 * son apparition, qui alimente la fonction pure `StickerAnimation.pose`. Elle ne lit aucune horloge murale :
 * elle n'avance qu'entre deux ticks consécutifs, un trou (appli en arrière-plan) ne fait pas sauter la phase.
 */
public class StickerMotionClock {

    public var elapsedSeconds: Double = 0.0
        private set

    private var lastTickNanos: Long? = null

    public fun advance(nowNanos: Long) {
        val last = lastTickNanos
        lastTickNanos = nowNanos
        if (last == null) return
        val step = (nowNanos - last) / NANOS_PER_SECOND
        if (step > 0.0 && step <= MAXIMUM_STEP_SECONDS) elapsedSeconds += step
    }

    public companion object {
        /** Au-delà, deux ticks encadrent un trou et non un intervalle. */
        public const val MAXIMUM_STEP_SECONDS: Double = 0.25
        private const val NANOS_PER_SECOND = 1_000_000_000.0
    }
}
