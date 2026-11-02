package me.meeshy.sdk.model.game.ceremony

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin

/** Un point du repère de la scène (360 × 640). */
public data class StagePoint(val x: Double, val y: Double) {
    public companion object {
        public val ZERO: StagePoint = StagePoint(0.0, 0.0)
    }
}

/** Un rectangle du repère de la scène : coin haut-gauche et taille. */
public data class StageRect(val x: Double, val y: Double, val width: Double, val height: Double)

/** Où la pièce file à la fin, dans le repère de la scène, et son échelle (1 = 150 unités). */
public data class MintCeremonyTarget(val x: Double, val y: Double, val scale: Double)

/**
 * LA SCÈNE DE LA FRAPPE (miroir de `MintCeremonyStage` iOS et de la maquette `docs/product/epopee/frappe-ceremonie.html`) :
 * une scène de 360 × 640, mise à l'échelle de l'écran sans déformation.
 */
public object MintCeremonyStage {
    public const val WIDTH: Double = 360.0
    public const val HEIGHT: Double = 640.0
    public val CIRCLE: StagePoint = StagePoint(180.0, 300.0)
    public const val RADIUS: Double = 84.0
    public val ORB: StagePoint = StagePoint(180.0, 96.0)
    public const val FORM: Double = 168.0
    public const val ANVIL: Double = 116.0
    public val ANVIL_CENTER: StagePoint = StagePoint(180.0, 543 - 116 / 2.0 + 3)
    public val DIE_ON: StagePoint = StagePoint(180.0 - 13, ANVIL_CENTER.y - 116 / 2.0 - 46)
    public val MEE_HOME: StagePoint = StagePoint(10.0, 244.0)
    public val MEO_HOME: StagePoint = StagePoint(258.0, 244.0)
    public val MEE_STRIKE: StagePoint = StagePoint(14.0, 404.0)
    public val MEO_STRIKE: StagePoint = StagePoint(252.0, 394.0)
    public val MEE_END: StagePoint = StagePoint(12.0, 262.0)
    public val MEO_END: StagePoint = StagePoint(256.0, 262.0)
    public val MEE_SOW: StagePoint = StagePoint(96.0, 296.0)
    public val MEO_SOW: StagePoint = StagePoint(264.0, 296.0)
    public const val COIN_BOX: Double = 150.0
    public const val BIRD: Double = 92.0

    /** Les angles des marteaux, en degrés : au repos, levé, à l'impact (Meo, puis Mee, en miroir). */
    public const val REST: Double = 12.0
    public const val WIND: Double = 62.0
    public const val HIT: Double = -54.0
    public const val REST_MEE: Double = -12.0
    public const val WIND_MEE: Double = -62.0
    public const val HIT_MEE: Double = 50.0

    /** Le contenant de l'Héritage, s'il n'est pas à l'écran : la pièce file vers le haut de la scène. */
    public val DEFAULT_TARGET: MintCeremonyTarget = MintCeremonyTarget(180.0, 40.0, 0.3)
}

/** Les courbes de la maquette. */
public object MintCeremonyEase {
    public fun clamp(x: Double): Double = if (x < 0) 0.0 else if (x > 1) 1.0 else x

    /** La progression de [t] entre [a] et [b] ; une phase qui ne commence jamais (infini) reste à 0. */
    public fun seg(t: Double, a: Double, b: Double): Double = when {
        a == Double.POSITIVE_INFINITY -> 0.0
        b <= a -> if (t >= a) 1.0 else 0.0
        else -> clamp((t - a) / (b - a))
    }

    public fun lerp(a: Double, b: Double, x: Double): Double = a + (b - a) * x
    public fun easeOut(x: Double): Double = 1 - (1 - x).pow(3)
    public fun easeIn(x: Double): Double = x * x * x
    public fun easeInOut(x: Double): Double = if (x < 0.5) 4 * x * x * x else 1 - (-2 * x + 2).pow(3) / 2
    public fun sine(x: Double): Double = -(cos(PI * x) - 1) / 2

    public fun bump(t: Double, at: Double, length: Double): Double {
        val x = (t - at) / length
        return if (x < 0 || x > 1) 0.0 else sin(PI * x)
    }
}

/** Une phase de la loi, en secondes ; une phase absente ne commence jamais. */
public data class MintCeremonySeconds(val from: Double, val to: Double) {
    public companion object {
        public val NEVER: MintCeremonySeconds = MintCeremonySeconds(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY)

        public fun of(span: MintCeremonySpan?): MintCeremonySeconds =
            span?.let { MintCeremonySeconds(it.fromMs / 1000.0, it.toMs / 1000.0) } ?: NEVER
    }
}

public fun MintCeremonyPlan.seconds(phase: MintCeremonyPhase): MintCeremonySeconds = MintCeremonySeconds.of(span(phase))

/**
 * LE TEMPS DE LA SCÈNE — égal au temps du toucher, sauf après un refus : la scène remonte alors jusqu'au départ des
 * étincelles, à la vitesse que la loi fixe, et reste là.
 */
public fun MintCeremonyPlan.sceneTime(t: Double): Double {
    val refusal = refusal ?: return t
    val at = refusal.atMs / 1000.0
    if (t <= at) return t
    val length = (refusal.rewind.toMs - refusal.rewind.fromMs) / 1000.0
    val back = refusal.rewindToMs / 1000.0
    if (length <= 0) return back
    return max(back - 0.001, at - ((t - at) * (at - back)) / length)
}
