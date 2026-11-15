package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryTransitionEffect
import kotlin.math.hypot
import kotlin.math.max

/**
 * La pose de la RACINE du canvas à un instant : opacité, échelle, glissement horizontal (fraction de la largeur) et
 * couverture du masque circulaire (`null` = pas de masque ; 0 = cercle d'un point, 1 = recouvrement complet).
 */
public data class SceneRootPose(
    val opacity: Double = 1.0,
    val scale: Double = 1.0,
    val translateXFraction: Double = 0.0,
    val revealCoverage: Double? = null,
) {
    public val isNeutral: Boolean get() = this == NEUTRAL

    public companion object {
        public val NEUTRAL: SceneRootPose = SceneRootPose()
    }
}

/**
 * La courbe de pose UNIQUE des transitions d'ouverture et de fermeture de slide (iOS
 * `StoryRenderer+RootTransitions`) : arithmétique pure échantillonnée depuis un temps écoulé, donc rejouable par
 * l'export (aucun moteur d'animation) et exacte en pause, en recherche et en rebouclage. Un effet absent (y compris
 * l'effet inconnu d'un futur client, décodé en `null`) n'anime rien.
 */
public object SceneRootTransitionPose {

    public const val DURATION_SECONDS: Double = 1.2
    public const val ZOOM_SCALE: Double = 1.08
    public const val SLIDE_TRAVEL_FRACTION: Double = 0.08

    /** Pose à [elapsed] secondes depuis l'entrée en lecture ; neutre une fois la durée écoulée. */
    public fun opening(effect: StoryTransitionEffect?, elapsed: Double): SceneRootPose {
        if (effect == null || !elapsed.isFinite()) return SceneRootPose.NEUTRAL
        if (elapsed >= DURATION_SECONDS) return SceneRootPose.NEUTRAL
        val progress = (elapsed / DURATION_SECONDS).coerceIn(0.0, 1.0)
        val remaining = 1.0 - progress
        return when (effect) {
            StoryTransitionEffect.FADE -> SceneRootPose(opacity = progress)
            StoryTransitionEffect.ZOOM -> SceneRootPose(scale = 1.0 + (ZOOM_SCALE - 1.0) * remaining)
            StoryTransitionEffect.SLIDE -> SceneRootPose(translateXFraction = SLIDE_TRAVEL_FRACTION * remaining)
            StoryTransitionEffect.REVEAL -> SceneRootPose(revealCoverage = progress)
        }
    }

    /** Progression linéaire de la sortie : 0 avant `total − 1,2 s`, 1 à `total`. */
    public fun closingProgress(totalDuration: Double, elapsed: Double): Double {
        if (!totalDuration.isFinite() || totalDuration <= 0.0 || !elapsed.isFinite()) return 0.0
        val start = totalDuration - DURATION_SECONDS
        if (elapsed <= start) return 0.0
        return ((elapsed - start) / DURATION_SECONDS).coerceIn(0.0, 1.0)
    }

    /** Pose de sortie pilotée par la tête de lecture ; neutre avant la fenêtre de fermeture. */
    public fun closing(effect: StoryTransitionEffect?, totalDuration: Double, elapsed: Double): SceneRootPose {
        if (effect == null) return SceneRootPose.NEUTRAL
        val progress = closingProgress(totalDuration, elapsed)
        if (progress <= 0.0) return SceneRootPose.NEUTRAL
        return when (effect) {
            StoryTransitionEffect.FADE -> SceneRootPose(opacity = 1.0 - progress)
            StoryTransitionEffect.ZOOM -> SceneRootPose(scale = 1.0 + (ZOOM_SCALE - 1.0) * progress)
            StoryTransitionEffect.SLIDE -> SceneRootPose(translateXFraction = -SLIDE_TRAVEL_FRACTION * progress)
            StoryTransitionEffect.REVEAL -> SceneRootPose(revealCoverage = 1.0 - progress)
        }
    }

    /**
     * Ouverture et fermeture composées : la fermeture prend la main dès qu'elle a commencé (sur une slide plus
     * courte que deux durées, l'entrée joue jusqu'à ce que la sortie démarre).
     */
    public fun at(opening: StoryTransitionEffect?, closing: StoryTransitionEffect?, totalDuration: Double, elapsed: Double): SceneRootPose {
        val exit = closing(closing, totalDuration, elapsed)
        return if (!exit.isNeutral) exit else opening(opening, elapsed)
    }

    /**
     * La pose d'une slide en LECTURE : l'ouverture suit son propre temps écoulé [openingElapsed] (elle s'arrête quand la
     * slide est en pause), la fermeture suit la tête de lecture [playbackSeconds]. Sous [reduceMotion] tout effet choisi
     * devient un fondu simple (aucun zoom, glissement ni masque) ; sans effet choisi, rien ne s'anime.
     */
    public fun poseAt(
        opening: StoryTransitionEffect?,
        closing: StoryTransitionEffect?,
        totalDuration: Double,
        openingElapsed: Double,
        playbackSeconds: Double,
        reduceMotion: Boolean,
    ): SceneRootPose {
        val inEffect = if (reduceMotion && opening != null) StoryTransitionEffect.FADE else opening
        val outEffect = if (reduceMotion && closing != null) StoryTransitionEffect.FADE else closing
        val exit = closing(outEffect, totalDuration, playbackSeconds)
        return if (!exit.isNeutral) exit else opening(inEffect, openingElapsed)
    }

    /** Rayon (même unité que [width]/[height]) du cercle de révélation : 1 pt à 0, demi-diagonale à 1. */
    public fun revealRadius(coverage: Double, width: Double, height: Double): Double {
        val maxRadius = hypot(width, height) / 2.0
        return max(1.0, 1.0 + (maxRadius - 1.0) * coverage.coerceIn(0.0, 1.0))
    }
}
