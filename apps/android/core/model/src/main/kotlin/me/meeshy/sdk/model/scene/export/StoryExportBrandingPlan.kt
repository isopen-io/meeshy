package me.meeshy.sdk.model.scene.export

import kotlin.math.floor

/** Fenêtre [startMillis, startMillis + durationMillis). */
public data class StoryExportTimeRange(val startMillis: Long, val durationMillis: Long) {
    val endMillis: Long get() = startMillis + durationMillis
}

/** Minutage de l'intro et de la carte de fin autour de la story (miroir de `StoryExportBranding.makePlan`). */
public data class StoryExportBrandingPlan(
    val hasIntro: Boolean,
    val storyStartMillis: Long,
    val introFade: StoryExportTimeRange,
    val outroDurationMillis: Long,
    val outroJingleOffsetMillis: Long,
) {
    public fun outroStartMillis(storyDurationMillis: Long): Long {
        val baseEnd = storyStartMillis + storyDurationMillis
        return maxOf(baseEnd - OUTRO_OVERLAP_MILLIS, 0L, introFade.endMillis)
    }

    public fun totalMillis(storyDurationMillis: Long): Long =
        outroStartMillis(storyDurationMillis) + outroDurationMillis

    public companion object {
        public const val INTRO_HOLD_MILLIS: Long = 1_200
        public const val INTRO_CROSSFADE_MILLIS: Long = 500
        public const val INTRO_CLIP_MILLIS: Long = INTRO_HOLD_MILLIS + INTRO_CROSSFADE_MILLIS
        public const val OUTRO_DURATION_MILLIS: Long = 2_000
        public const val OUTRO_OVERLAP_MILLIS: Long = 1_500
        public const val AUTHOR_LOGO_PHASE_MILLIS: Long = 1_500
        public const val AUTHOR_IDENTITY_PHASE_MILLIS: Long = 2_000
        public const val AUTHOR_IDENTITY_FADE_IN_MILLIS: Long = 400
        public const val AUTHOR_CLIP_MILLIS: Long = AUTHOR_LOGO_PHASE_MILLIS + AUTHOR_IDENTITY_PHASE_MILLIS
        public const val AUTHOR_WATERMARK_OPACITY: Double = 0.22

        public fun make(hasIntro: Boolean, hasAuthorOutro: Boolean): StoryExportBrandingPlan {
            val start = if (hasIntro) INTRO_HOLD_MILLIS else 0L
            return StoryExportBrandingPlan(
                hasIntro = hasIntro,
                storyStartMillis = start,
                introFade = StoryExportTimeRange(start, if (hasIntro) INTRO_CROSSFADE_MILLIS else 0L),
                outroDurationMillis = if (hasAuthorOutro) AUTHOR_CLIP_MILLIS else OUTRO_DURATION_MILLIS,
                outroJingleOffsetMillis = if (hasAuthorOutro) AUTHOR_LOGO_PHASE_MILLIS else 0L,
            )
        }
    }
}

public enum class StoryExportWatermarkCorner { BOTTOM_RIGHT, TOP_LEFT }

/** Filigrane animé : segments de 12 s, coin alterné, fondu de 0,4 s à chaque bascule. */
public object StoryExportWatermarkPlan {
    public const val SEGMENT_SECONDS: Double = 12.0
    public const val FADE_SECONDS: Double = 0.4
    public const val BASE_OPACITY: Double = 0.22

    public fun corner(atSeconds: Double): StoryExportWatermarkCorner =
        if (floor(atSeconds / SEGMENT_SECONDS).toLong() % 2L == 0L) StoryExportWatermarkCorner.BOTTOM_RIGHT
        else StoryExportWatermarkCorner.TOP_LEFT

    public fun alpha(atSeconds: Double, baseOpacity: Double = BASE_OPACITY): Double {
        val local = atSeconds - floor(atSeconds / SEGMENT_SECONDS) * SEGMENT_SECONDS
        val fadeIn = minOf(1.0, local / FADE_SECONDS)
        val fadeOut = minOf(1.0, (SEGMENT_SECONDS - local) / FADE_SECONDS)
        return baseOpacity.coerceIn(0.0, 1.0) * maxOf(0.0, minOf(fadeIn, fadeOut))
    }
}
