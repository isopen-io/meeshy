package me.meeshy.sdk.model.scene

/**
 * Horloge de tick du lecteur de scène — miroir de `PlayheadTickClock.swift` (#9702).
 *
 * Le playhead avance du temps RÉEL écoulé entre deux ticks, pas de la durée nominale d'une image : une image perdue
 * est du temps perdu pour la timeline comme pour l'audio, qui joue sur son propre fil. Au-delà de [MAX_TICK_GAP_SECONDS]
 * l'écart n'est plus une image perdue mais une suspension (arrière-plan, pause) : on n'avance que d'une image.
 * Pure : les instants sont des secondes d'une horloge monotone quelconque.
 */
public class PlayheadTickClock {

    private var lastTick: Double? = null
    private var lastDriftCheck: Double? = null

    /** Avance l'horloge à [now] et rend le temps dont le playhead progresse. */
    public fun advance(now: Double, nominal: Double): Double {
        val step = elapsed(lastTick, now, nominal)
        lastTick = now
        return step
    }

    /** Une pause gèle l'horloge : le premier tick de la reprise ne compte pas la durée de la pause. */
    public fun reset() {
        lastTick = null
    }

    /** Vrai (et réarme) quand ≥ [DRIFT_CHECK_INTERVAL_SECONDS] se sont écoulées ; le premier appel ne déclenche pas. */
    public fun isDriftCheckDue(now: Double): Boolean {
        val last = lastDriftCheck
        if (last == null) {
            lastDriftCheck = now
            return false
        }
        if (now - last < DRIFT_CHECK_INTERVAL_SECONDS) return false
        lastDriftCheck = now
        return true
    }

    public companion object {
        public const val MAX_TICK_GAP_SECONDS: Double = 0.25
        public const val DRIFT_CHECK_INTERVAL_SECONDS: Double = 0.5

        public fun elapsed(
            previous: Double?,
            now: Double,
            nominal: Double,
            maxGap: Double = MAX_TICK_GAP_SECONDS,
        ): Double {
            val frame = if (nominal.isFinite()) maxOf(0.0, nominal) else 0.0
            if (previous == null || !previous.isFinite() || !now.isFinite()) return frame
            val delta = now - previous
            if (delta <= 0.0) return 0.0
            return if (delta > maxGap) frame else delta
        }
    }
}
