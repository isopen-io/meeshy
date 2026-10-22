package me.meeshy.sdk.model

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin

/**
 * Le mouvement d'une décoration de sticker — miroir de `StickerAnimation` (iOS, #4821).
 *
 * Neuf mouvements continus (périodiques) et deux mouvements « en un coup » ([POP], [TADA]).
 * Le mouvement est une fonction PURE du temps ([pose]) : ni horloge ni vue, donc deux
 * lecteurs rendent les mêmes images. Toute pose est BORNÉE (échelle dans [0,7 ; 1,3],
 * décalage sous 20 % du côté, opacité au-dessus de 0,70).
 */
enum class StickerAnimation(val wireName: String) {
    PULSE("pulse"),
    HEARTBEAT("heartbeat"),
    WOBBLE("wobble"),
    BOUNCE("bounce"),
    FLOAT("float"),
    SPIN("spin"),
    BLINK("blink"),
    SHAKE("shake"),
    SWING("swing"),
    POP("pop"),
    TADA("tada"),
    ;

    /** Ce qu'une animation FAIT à une décoration ; les décalages sont des fractions du côté rendu. */
    data class Pose(
        val scale: Double = 1.0,
        val rotationDegrees: Double = 0.0,
        /** Fraction de la largeur rendue ; positif = vers la droite. */
        val offsetX: Double = 0.0,
        /** Fraction de la hauteur rendue ; positif = vers le bas. */
        val offsetY: Double = 0.0,
        val opacity: Double = 1.0,
    ) {
        val isIdentity: Boolean get() = this == IDENTITY

        companion object {
            val IDENTITY: Pose = Pose()
        }
    }

    /** La durée d'un cycle, en secondes — ou celle du coup unique. */
    val period: Double
        get() = when (this) {
            PULSE -> 1.4
            HEARTBEAT -> 1.1
            WOBBLE -> 1.6
            BOUNCE -> 1.2
            FLOAT -> 3.0
            SPIN -> 4.0
            BLINK -> 1.2
            SHAKE -> 0.8
            SWING -> 2.2
            POP -> 0.6
            TADA -> 0.9
        }

    /** Joue UNE fois à l'apparition, puis se tient immobile. */
    val isOneShot: Boolean get() = this == POP || this == TADA

    /** L'instant depuis lequel plus rien ne bouge, ou `null` pour un mouvement qui se répète. */
    val settlesAfter: Double? get() = if (isOneShot) period else null

    /**
     * La pose à [seconds] depuis l'APPARITION de la décoration. `t <= 0`, non fini, ou un
     * coup unique terminé rendent l'identité.
     */
    fun pose(seconds: Double): Pose {
        if (!seconds.isFinite() || seconds <= 0.0) return Pose.IDENTITY
        if (isOneShot && seconds >= period) return Pose.IDENTITY
        val phase = if (isOneShot) seconds / period else (seconds % period) / period
        return poseAtPhase(phase)
    }

    private fun poseAtPhase(p: Double): Pose {
        val tour = 2 * PI * p
        return when (this) {
            PULSE -> Pose(scale = 1 + 0.10 * (1 - cos(tour)) / 2)
            HEARTBEAT -> Pose(scale = 1 + 0.14 * bump(p, 0.18, 0.06) + 0.10 * bump(p, 0.36, 0.06))
            WOBBLE -> Pose(rotationDegrees = 8 * sin(tour))
            BOUNCE -> Pose(offsetY = -0.14 * sin(PI * p))
            FLOAT -> Pose(offsetY = -0.06 * sin(tour))
            SPIN -> Pose(rotationDegrees = 360 * p)
            BLINK -> Pose(opacity = 1 - 0.30 * (1 - cos(tour)) / 2)
            SHAKE -> Pose(offsetX = 0.035 * sin(4 * tour))
            SWING -> Pose(rotationDegrees = 14 * sin(tour))
            POP -> Pose(scale = 1 + 0.25 * sin(PI * p))
            TADA -> Pose(scale = 1 + 0.12 * sin(PI * p), rotationDegrees = 6 * sin(2 * tour) * (1 - p))
        }
    }

    companion object {
        /** Un nom inconnu (publié par une version plus récente) vaut `null` : le sticker reste, immobile. */
        fun fromWire(name: String?): StickerAnimation? = entries.firstOrNull { it.wireName == name }

        private fun bump(p: Double, centre: Double, largeur: Double): Double {
            val ecart = (p - centre) / largeur
            return exp(-ecart * ecart)
        }
    }
}
