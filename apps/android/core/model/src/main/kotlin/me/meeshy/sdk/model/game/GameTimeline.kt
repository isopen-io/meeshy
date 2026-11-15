package me.meeshy.sdk.model.game

import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Les chorégraphies du jeu comme FONCTIONS PURES du temps (miroir de `GameTimeline.swift`) :
 * « à 0,45 s, le marteau est en bas ». Elles se prouvent sans écran ; la vue ne fait que les lire
 * à chaque image. Les durées sont celles de la planche.
 */
object GameTimeline {

    const val STRIKE_DURATION: Double = 1.2
    const val RANK_DURATION: Double = 1.6
    const val LEVEL_GAIN_DURATION: Double = 0.6
    const val LEVEL_LOSS_DURATION: Double = 0.8
    const val BADGE_DURATION: Double = 0.7
    const val CHEST_DURATION: Double = 1.4

    /** Sous « réduire les animations » : un fondu, pas un mouvement. */
    const val REDUCED_DURATION: Double = 0.25

    /** L'instant du « tchak » : le marteau touche le flan. */
    const val STRIKE_IMPACT: Double = 0.45

    /** Les trois traits de la Signature, un par tape haptique. */
    val RANK_STROKE_TIMES: List<Double> = listOf(0.55, 0.8, 1.05)

    const val CHEST_LID_END: Double = 0.4

    /** La fraction de [from] à [to] parcourue à l'instant [t], bornée à [0, 1]. */
    fun window(t: Double, from: Double, to: Double): Double {
        if (to <= from) return if (t >= to) 1.0 else 0.0
        return min(1.0, max(0.0, (t - from) / (to - from)))
    }

    /** Départ et arrivée en douceur : le geste ne démarre ni ne s'arrête net. */
    fun smooth(x: Double): Double {
        val c = min(1.0, max(0.0, x))
        return c * c * (3 - 2 * c)
    }

    data class Strike(
        /** 0 : Mee loin du flan ; 1 : il l'a posé. */
        val plate: Double,
        /** 0 : marteau levé ; 1 : marteau sur le flan (à l'impact). */
        val hammer: Double,
        /** 0 → 1 : l'onde qui part du point d'impact. */
        val wave: Double,
        /** 0 : avers ; 1 : revers (le numéro). */
        val flip: Double,
        /** Le reflet qui parcourt la face, une fois. */
        val sheen: Double,
        /** Le « tchak ! » lisible un instant autour de l'impact. */
        val burst: Double,
    )

    fun strike(atSeconds: Double): Strike = Strike(
        plate = smooth(window(atSeconds, 0.0, 0.3)),
        hammer = smooth(window(atSeconds, 0.3, STRIKE_IMPACT)) *
            (1 - smooth(window(atSeconds, STRIKE_IMPACT, 0.62))),
        wave = window(atSeconds, STRIKE_IMPACT, 0.95),
        flip = smooth(window(atSeconds, 0.55, 1.2)),
        sheen = window(atSeconds, 0.7, 1.2),
        burst = sin(PI * window(atSeconds, STRIKE_IMPACT, 0.8)),
    )

    data class Rank(
        /** 0 : l'écu est bas et transparent ; 1 : posé. */
        val rise: Double,
        /** L'éclat de chacun des trois traits, 0 → 1 → 0. */
        val strokes: List<Double>,
        /** Les tenants se posent à la fin. */
        val tenants: Double,
        val sheen: Double,
    )

    fun rank(atSeconds: Double): Rank = Rank(
        rise = smooth(window(atSeconds, 0.0, 0.5)),
        strokes = RANK_STROKE_TIMES.map { sin(PI * window(atSeconds, it, it + 0.3)) },
        tenants = smooth(window(atSeconds, 1.15, 1.6)),
        sheen = window(atSeconds, 0.9, 1.6),
    )

    /** La fraction de l'arc entre deux niveaux : elle se remplit en 0,6 s, se vide en 0,8 s. */
    fun ringProgress(from: Double, to: Double, atSeconds: Double, duration: Double): Double =
        from + (to - from) * smooth(window(atSeconds, 0.0, duration))

    /** Badge : la matière remonte du bas (0,7 s) ; éteint, elle redescend. */
    fun badgeFill(lighting: Boolean, atSeconds: Double): Double {
        val rise = smooth(window(atSeconds, 0.0, BADGE_DURATION))
        return if (lighting) rise else 1 - rise
    }

    /** 0 : fermé ; 1 : ouvert. */
    fun chestLid(atSeconds: Double): Double = smooth(window(atSeconds, 0.0, CHEST_LID_END))

    /** L'instant où la récompense [index] (0, 1, 2) commence à monter. */
    fun rewardStart(index: Int): Double = 0.5 + index * 0.3

    /** 0 : la récompense [index] est encore dans le coffre ; 1 : elle est sortie. */
    fun reward(index: Int, atSeconds: Double): Double =
        smooth(window(atSeconds, rewardStart(index), rewardStart(index) + 0.3))
}
