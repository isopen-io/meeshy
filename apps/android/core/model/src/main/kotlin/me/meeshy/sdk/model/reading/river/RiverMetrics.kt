package me.meeshy.sdk.model.reading.river

import kotlin.math.abs
import kotlin.math.max

/**
 * Cotes de PIXELS (dp) de la peau Rivière — miroir de `RiverMetrics.swift` et de
 * `packages/shared/design/lentille-tokens.json` → `river` (rejoué par `RiverMetricsParityTest` :
 * on répare le token, jamais le test). Aucune constante de LOI ici (`RiverLawConstants`).
 */
object RiverMetrics {

    object Line {
        /** Trait d'une branche ET bordure de la bulle (le contour EST un segment de la ligne). */
        const val WIDTH: Double = 2.5
    }

    object Lane {
        const val WIDTH_REFERENCE: Double = 300.0
        const val WIDTH_MIN: Double = 210.0
        const val WIDTH_MAX: Double = 540.0
        const val GUTTER: Double = 28.0
    }

    object Bubble {
        const val DETOUR_RADIUS: Double = 14.0
        const val BASE_GAP: Double = 8.0
        const val CONTENT_PADDING: Double = 14.0

        /** Fraction de la largeur de bulle (le JSON porte `"44%"`). */
        const val IDENTITY_NAME_MAX_WIDTH: Double = 0.44
        const val FLAT_BORDER_WIDTH: Double = 1.0
    }

    object Connector {
        const val STROKE_WIDTH: Double = 1.4
        const val MIN_BOW: Double = 34.0
        const val BOW_RATIO: Double = 0.5

        /** `max(minBow, |Δ| · bowRatio)` : le contrôle de la courbe de Bézier d'un connecteur de réponse. */
        fun bow(laneDistancePoints: Double): Double = max(MIN_BOW, abs(laneDistancePoints) * BOW_RATIO)
    }

    object Row {
        const val GAP: Double = 14.0
        const val CONTINUATION_SEAM: Double = 3.0
        const val CONTINUATION_DASH_LENGTH: Double = 3.0
        const val CONTINUATION_DASH_GAP: Double = 4.0
    }

    object LaneHeader {
        const val HEIGHT: Double = 38.0
    }

    /** Cotes de la poignée du temps, propres à la peau (hors du JSON partagé), en dp et secondes. */
    object TimeHandle {
        const val TRACK_WIDTH: Double = 3.0
        const val TRACK_INSET: Double = 6.0
        const val HANDLE_WIDTH: Double = 30.0
        const val HANDLE_HEIGHT: Double = 44.0
        const val TICK_LENGTH: Double = 8.0

        /** La poignée s'efface après ce silence de défilement. */
        const val REST_DELAY_SECONDS: Double = 1.4
    }

    object Motion {
        /** Glissade d'un cadrage demandé (citation, poignée du temps). */
        const val LANDING_DURATION_SECONDS: Double = 0.35
        const val HANDLE_FADE_DURATION_SECONDS: Double = 0.2
    }
}
