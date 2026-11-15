package me.meeshy.sdk.model.scene

import kotlin.math.hypot

/**
 * Détecteur pur d'un pincement à EXACTEMENT trois doigts (miroir de `ThreeFingerPinchGestureRecognizer` iOS) : il évite
 * la collision avec le pincement à deux doigts d'un objet. L'échelle est le rapport entre la distance moyenne des doigts
 * à leur centroïde et celle capturée au début. Un quatrième doigt avant le début fait échouer le geste, après le début
 * il l'annule ; lever un doigt le termine. Le détecteur reste inerte jusqu'à ce que tous les doigts soient levés.
 */
public class ThreeFingerPinchDetector {
    public data class Point(val x: Float, val y: Float)

    public sealed interface Event {
        public data object None : Event
        public data object Began : Event
        public data class Changed(val scale: Float) : Event
        public data class Ended(val scale: Float) : Event
        public data object Cancelled : Event
    }

    private enum class Phase { POSSIBLE, ACTIVE, DEAD }

    private var phase = Phase.POSSIBLE
    private var initialDistance = 0f
    private var scale = 1f

    /** À appeler à chaque événement avec les positions de tous les doigts posés. */
    public fun onTouches(points: List<Point>): Event {
        if (points.isEmpty()) {
            val wasActive = phase == Phase.ACTIVE
            val last = scale
            reset()
            return if (wasActive) Event.Ended(last) else Event.None
        }
        return when (phase) {
            Phase.DEAD -> Event.None
            Phase.POSSIBLE -> possible(points)
            Phase.ACTIVE -> active(points)
        }
    }

    private fun possible(points: List<Point>): Event = when {
        points.size < REQUIRED -> Event.None
        points.size > REQUIRED -> { phase = Phase.DEAD; Event.None }
        else -> {
            initialDistance = averageDistance(points)
            if (initialDistance <= 0f) {
                Event.None
            } else {
                phase = Phase.ACTIVE
                scale = 1f
                Event.Began
            }
        }
    }

    private fun active(points: List<Point>): Event = when {
        points.size > REQUIRED -> { phase = Phase.DEAD; Event.Cancelled }
        points.size < REQUIRED -> { phase = Phase.DEAD; Event.Ended(scale) }
        else -> {
            scale = averageDistance(points) / initialDistance
            Event.Changed(scale)
        }
    }

    private fun reset() {
        phase = Phase.POSSIBLE
        initialDistance = 0f
        scale = 1f
    }

    public companion object {
        public const val REQUIRED: Int = 3

        public fun averageDistance(points: List<Point>): Float {
            if (points.isEmpty()) return 0f
            val cx = points.sumOf { it.x.toDouble() }.toFloat() / points.size
            val cy = points.sumOf { it.y.toDouble() }.toFloat() / points.size
            return points.sumOf { hypot((it.x - cx).toDouble(), (it.y - cy).toDouble()) }.toFloat() / points.size
        }
    }
}
