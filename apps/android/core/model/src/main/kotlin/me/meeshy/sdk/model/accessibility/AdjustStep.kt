package me.meeshy.sdk.model.accessibility

public enum class AdjustDirection { INCREMENT, DECREMENT }

/** Pas des poignées ajustables (lecteur d'écran) : miroir de `MeeshyAdjustStep` (iOS). */
public object AdjustStep {
    public const val SECONDS: Double = 0.1
    public const val FRACTION: Double = 0.01

    public fun signed(step: Double, direction: AdjustDirection): Double = when (direction) {
        AdjustDirection.INCREMENT -> step
        AdjustDirection.DECREMENT -> -step
    }

    /** Fraction suivante arrondie au centième et bornée à 0..1 ; null si rien ne change. */
    public fun nudgedFraction(value: Double, direction: AdjustDirection): Double? {
        val next = (Math.round((value + signed(FRACTION, direction)) * 100.0) / 100.0).coerceIn(0.0, 1.0)
        return if (next == value) null else next
    }
}
