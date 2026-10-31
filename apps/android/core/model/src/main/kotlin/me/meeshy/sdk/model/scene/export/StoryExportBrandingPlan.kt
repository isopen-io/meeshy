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

    /** La carte de fin porte-t-elle l'identité de l'auteur (logo muet, puis carte d'auteur qui porte le jingle) ? */
    public val hasAuthorOutro: Boolean get() = outroJingleOffsetMillis > 0L

    /** Fin de la story sur la timeline de l'export : elle démarre après la tenue de l'intro. */
    public fun storyEndMillis(storyDurationMillis: Long): Long = storyStartMillis + storyDurationMillis

    /** Opacité de l'intro à [atMillis] : pleine pendant la tenue, puis elle se fond vers la story sur le fondu. */
    public fun introAlpha(atMillis: Long): Float = when {
        !hasIntro -> 0f
        atMillis < introFade.startMillis -> 1f
        atMillis >= introFade.endMillis -> 0f
        else -> 1f - (atMillis - introFade.startMillis).toFloat() / introFade.durationMillis.toFloat()
    }

    /** Courbe de volume du jingle d'ouverture : plein pendant la tenue, éteint avec le fondu. */
    public fun introJingleEnvelope(): List<StoryExportVolumePoint> = listOf(
        StoryExportVolumePoint(0L, 1f),
        StoryExportVolumePoint(introFade.startMillis, 1f),
        StoryExportVolumePoint(introFade.endMillis, 0f),
    )

    /** Opacité de la carte de fin à [atMillis] : elle recouvre la fin de la story sur le chevauchement, puis reste pleine. */
    public fun outroAlpha(atMillis: Long, storyDurationMillis: Long): Float {
        val start = outroStartMillis(storyDurationMillis)
        val span = storyEndMillis(storyDurationMillis) - start
        return when {
            atMillis < start -> 0f
            span <= 0L || atMillis >= start + span -> 1f
            else -> (atMillis - start).toFloat() / span.toFloat()
        }
    }

    /** Opacité de la carte d'auteur, 2e phase de la fermeture : entre en fondu après le logo muet ; 0 sans identité. */
    public fun authorCardAlpha(atMillis: Long, storyDurationMillis: Long): Float {
        if (!hasAuthorOutro) return 0f
        val local = atMillis - (outroStartMillis(storyDurationMillis) + AUTHOR_LOGO_PHASE_MILLIS)
        return (local.toFloat() / AUTHOR_IDENTITY_FADE_IN_MILLIS.toFloat()).coerceIn(0f, 1f)
    }

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
