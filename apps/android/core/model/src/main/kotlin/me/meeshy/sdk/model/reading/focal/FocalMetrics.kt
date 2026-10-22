package me.meeshy.sdk.model.reading.focal

import kotlin.math.floor

/**
 * Cotes normatives de la rangée plate du Fil (Focal) — miroir Kotlin de
 * `FocalMetrics.swift` (iOS) et de `packages/shared/design/lentille-tokens.json` → `thread`.
 * Valeurs en dp, en `Double` comme le `CGFloat` iOS (ou en secondes, millisecondes, ratios).
 * Les tailles de police (`Name`, `Text.size`) relèvent de la typographie du design system et ne sont pas portées ici.
 */
object FocalMetrics {

    object Row {
        const val PADDING_VERTICAL: Double = 3.0
        const val PADDING_HORIZONTAL: Double = 16.0
        const val GROUP_TOP_PADDING: Double = 8.0
        const val CONTENT_INDENT: Double = Text.INDENT
    }

    object Avatar {
        const val SIZE: Double = 22.0
    }

    object Time {
        const val SIZE: Double = 12.0
    }

    object Text {
        const val LINE_HEIGHT_RATIO: Double = 1.42
        const val INDENT: Double = 29.0

        /** `(s * (ratio - 1) * 2).rounded() / 2` : arrondi au demi-point, moitié vers l'infini. */
        fun lineSpacing(forResolvedFontSize: Float): Float {
            val raw = (forResolvedFontSize.toDouble() * (LINE_HEIGHT_RATIO - 1.0) * 2.0)
            return (floor(raw + 0.5) / 2.0).toFloat()
        }
    }

    object FocusCard {
        const val RING_SIZE: Double = 1.5
        const val RADIUS: Double = 16.0
        const val MARGIN_HORIZONTAL: Double = 3.0
        const val MARGIN_VERTICAL: Double = 8.0
        const val PADDING_HORIZONTAL: Double = 8.0
        const val PADDING_VERTICAL: Double = 12.0
        const val SURFACE_LIGHT_ALPHA: Double = 0.055
        const val SURFACE_DARK_ALPHA: Double = 0.10
    }

    object Scene {
        const val REST_DELAY_MS: Long = 4_500
        const val FLATTEN_DURATION_MS: Long = 450
        const val ENTER_DURATION_MS: Long = 250
        const val REST_DELAY_SECONDS: Double = REST_DELAY_MS / 1000.0
        const val FLATTEN_DURATION_SECONDS: Double = FLATTEN_DURATION_MS / 1000.0
        const val ENTER_DURATION_SECONDS: Double = ENTER_DURATION_MS / 1000.0
    }

    object Focus {
        /** Cote historique de la rangée; la troncature vivante est [LongMessageExcerpt.THRESHOLD]. */
        const val MAX_CHARACTERS: Int = 360
        const val AVATAR_SIZE: Double = 34.0
        const val TEXT_INDENT: Double = AVATAR_SIZE + 7.0
        const val LOUPE_GAIN: Double = 0.26
        const val EXPANDED_LOUPE_GAIN: Double = 0.05
        const val EXPAND_DURATION_SECONDS: Double = 0.3
        val EXPAND_CURVE: List<Double> = listOf(0.2, 0.0, 0.0, 1.0)
    }

    object Quote {
        const val RAIL_WIDTH: Double = 2.5
    }

    object Sticker {
        const val SIDE: Double = 140.0
    }

    object Media {
        const val RADIUS: Double = 16.0
    }

    object FocusStrip {
        const val CHIP_HEIGHT: Double = 24.0
        const val CHIP_MIN_WIDTH: Double = 32.0
        const val CHIP_INSET: Double = 4.0
        const val IDENTITY_AVATAR_SIZE: Double = 26.0
        const val IDENTITY_CHIP_HEIGHT: Double = 34.0
        const val IDENTITY_NAME_SIZE: Double = 13.5
        const val FLAG_LIMIT_PLAIN: Int = 3
        const val FLAG_LIMIT_MAGNIFIED: Int = 5
        const val STRIP_GAP: Double = Row.PADDING_VERTICAL

        fun contentLift(isFirstInGroup: Boolean): Double =
            if (isFirstInGroup) 0.0 else IDENTITY_CHIP_HEIGHT + Row.PADDING_VERTICAL
    }

    object HiddenChrome {
        const val TRANSLATE_Y: Double = 94.0
        const val OPACITY_END: Double = 0.0
        const val EASE_OUT_SECONDS: Double = 0.25
        const val EDGE_TRAVEL: Double = 28.0
    }

    object Pill {
        const val TOP: Double = 72.0
        const val FADE_DURATION_MS: Double = 280.0
        const val GAP: Double = 8.0
        val fadeDurationSeconds: Double get() = FADE_DURATION_MS / 1000.0
    }

    object Agent {
        const val BORDER_WIDTH: Double = 1.5
        const val RADIUS: Double = 14.0
    }

    object MetaText {
        const val LIGHT_OPACITY: Double = 0.55
        const val DARK_OPACITY: Double = 0.55
    }

    object MetaColumn {
        const val RESERVED_WIDTH: Double = 62.0
        const val SPACING: Double = 6.0
    }

    object SurfaceTint {
        const val LIGHT_FILL: Double = 0.04
        const val DARK_FILL: Double = 0.06
    }

    /** Verre du focus et perspective de défilement, partagés avec le web (`focal-metrics.json`). */
    object Glass {
        const val RADIUS: Double = 18.0
        const val HORIZONTAL_INSET: Double = 6.0
        const val VERTICAL_INSET: Double = 3.0
        const val LOUPE_MARGIN_VERTICAL: Double = 8.0
        const val LOUPE_MARGIN_HORIZONTAL: Double = 16.0
        const val NEIGHBOR_OPACITY: Double = 0.62
    }
}
