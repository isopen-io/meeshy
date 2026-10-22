package me.meeshy.sdk.model.reading.focal

import kotlin.math.floor

/**
 * Cotes normatives de la rangée plate du Fil (Focal) — miroir Kotlin de
 * `FocalMetrics.swift` (iOS) et de `packages/shared/design/lentille-tokens.json` → `thread`.
 * Valeurs en dp (ou en secondes / ratios). Les tailles de police (`Name`, `Text.size`)
 * relèvent de la typographie du design system et ne sont pas portées ici.
 */
object FocalMetrics {

    object Row {
        const val PADDING_VERTICAL: Float = 3f
        const val PADDING_HORIZONTAL: Float = 16f
        const val GROUP_TOP_PADDING: Float = 8f
        const val CONTENT_INDENT: Float = Text.INDENT
    }

    object Avatar {
        const val SIZE: Float = 22f
    }

    object Time {
        const val SIZE: Float = 12f
    }

    object Text {
        const val LINE_HEIGHT_RATIO: Float = 1.42f
        const val INDENT: Float = 29f

        /** `(s * (ratio - 1) * 2).rounded() / 2` : arrondi au demi-point, moitié vers l'infini. */
        fun lineSpacing(forResolvedFontSize: Float): Float {
            val raw = (forResolvedFontSize.toDouble() * (LINE_HEIGHT_RATIO.toDouble() - 1.0) * 2.0)
            return (floor(raw + 0.5) / 2.0).toFloat()
        }
    }

    object FocusCard {
        const val RING_SIZE: Float = 1.5f
        const val RADIUS: Float = 16f
        const val MARGIN_HORIZONTAL: Float = 3f
        const val MARGIN_VERTICAL: Float = 8f
        const val PADDING_HORIZONTAL: Float = 8f
        const val PADDING_VERTICAL: Float = 12f
        const val SURFACE_LIGHT_ALPHA: Float = 0.055f
        const val SURFACE_DARK_ALPHA: Float = 0.10f
    }

    object Scene {
        const val REST_DELAY_SECONDS: Double = 4.5
        const val FLATTEN_DURATION_SECONDS: Double = 0.45
        const val ENTER_DURATION_SECONDS: Double = 0.25
    }

    object Focus {
        /** Cote historique de la rangée; la troncature vivante est [LongMessageExcerpt.THRESHOLD]. */
        const val MAX_CHARACTERS: Int = 360
        const val AVATAR_SIZE: Float = 34f
        const val TEXT_INDENT: Float = AVATAR_SIZE + 7f
        const val LOUPE_GAIN: Float = 0.26f
        const val EXPANDED_LOUPE_GAIN: Float = 0.05f
        const val EXPAND_DURATION_SECONDS: Double = 0.3
        val EXPAND_CURVE: List<Double> = listOf(0.2, 0.0, 0.0, 1.0)
    }

    object Quote {
        const val RAIL_WIDTH: Float = 2.5f
    }

    object Sticker {
        const val SIDE: Float = 140f
    }

    object Media {
        const val RADIUS: Float = 16f
    }

    object FocusStrip {
        const val CHIP_HEIGHT: Float = 24f
        const val CHIP_MIN_WIDTH: Float = 32f
        const val CHIP_INSET: Float = 4f
        const val IDENTITY_AVATAR_SIZE: Float = 26f
        const val IDENTITY_CHIP_HEIGHT: Float = 34f
        const val IDENTITY_NAME_SIZE: Float = 13.5f
        const val FLAG_LIMIT_PLAIN: Int = 3
        const val FLAG_LIMIT_MAGNIFIED: Int = 5
        const val STRIP_GAP: Float = Row.PADDING_VERTICAL

        fun contentLift(isFirstInGroup: Boolean): Float =
            if (isFirstInGroup) 0f else IDENTITY_CHIP_HEIGHT + Row.PADDING_VERTICAL
    }

    object HiddenChrome {
        const val TRANSLATE_Y: Float = 94f
        const val OPACITY_END: Float = 0f
        const val EASE_OUT_SECONDS: Double = 0.25
        const val EDGE_TRAVEL: Float = 28f
    }

    object Pill {
        const val TOP: Float = 72f
        const val FADE_DURATION_MS: Double = 280.0
        const val GAP: Float = 8f
        val fadeDurationSeconds: Double get() = FADE_DURATION_MS / 1000.0
    }

    object Agent {
        const val BORDER_WIDTH: Float = 1.5f
        const val RADIUS: Float = 14f
    }

    object MetaText {
        const val LIGHT_OPACITY: Float = 0.55f
        const val DARK_OPACITY: Float = 0.55f
    }

    object MetaColumn {
        const val RESERVED_WIDTH: Float = 62f
        const val SPACING: Float = 6f
    }

    object SurfaceTint {
        const val LIGHT_FILL: Float = 0.04f
        const val DARK_FILL: Float = 0.06f
    }

    /** Verre du focus et perspective de défilement, partagés avec le web (`focal-metrics.json`). */
    object Glass {
        const val RADIUS: Float = 18f
        const val HORIZONTAL_INSET: Float = 6f
        const val VERTICAL_INSET: Float = 3f
        const val LOUPE_MARGIN_VERTICAL: Float = 8f
        const val LOUPE_MARGIN_HORIZONTAL: Float = 16f
        const val NEIGHBOR_OPACITY: Float = 0.62f
    }
}
