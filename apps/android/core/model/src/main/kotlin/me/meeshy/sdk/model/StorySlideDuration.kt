package me.meeshy.sdk.model

import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * Single source of truth for how long a story slide stays on screen before the
 * viewer auto-advances — the Android port of iOS `StorySlide.computedTotalDuration()`
 * / `StoryEffects.contentDerivedDuration(...)` (StoryModels.swift). Pure: no clock,
 * no IO, so the whole rule is unit-tested in one place and the viewer stays glue.
 *
 * Priority (mirrors iOS exactly):
 *  0. [StoryEffects.timelineDuration] when `> 0` — the author pinned it in the
 *     timeline editor, so it wins over content (a longer media is cropped). The
 *     legacy [StoryEffects.slideDuration] is deliberately IGNORED: old backend
 *     stories carry arbitrary values (12s, …) the composer wrote per publish,
 *     bypassing this rule.
 *  Otherwise, content-derived:
 *  1. a background video/audio present → its duration, looped up to at least the
 *     target (a period shorter than the target extends to `ceil(target/period)*period`);
 *  2. long caption text (cumulative words `> 30`) → 6s plus 1s per 6 words past 30,
 *     giving the reader time to read;
 *  3. a plain static slide → 6s.
 */
object StorySlideDuration {

    /** Baseline duration of a static slide, in seconds. */
    const val DEFAULT_STATIC_SECONDS: Double = 6.0

    /** Baseline duration of a static slide, in whole milliseconds. */
    const val DEFAULT_STATIC_MS: Int = 6000

    /** Word count past which the caption starts extending the slide duration. */
    const val LONG_TEXT_THRESHOLD_WORDS: Int = 30

    /** Extra seconds granted per word beyond [LONG_TEXT_THRESHOLD_WORDS] (1s per 6 words). */
    const val LONG_TEXT_SECONDS_PER_WORD: Double = 1.0 / 6.0

    /** The effective duration in seconds for a slide carrying [effects] (`null` → default). */
    fun computeSeconds(effects: StoryEffects?): Double {
        if (effects == null) return DEFAULT_STATIC_SECONDS
        val pinned = effects.timelineDuration
        if (pinned != null && pinned > 0.0) return pinned
        return contentDerivedSeconds(
            mediaObjects = effects.mediaObjects,
            audioPlayerObjects = effects.audioPlayerObjects,
            textObjects = effects.textObjects,
        )
    }

    /** The effective duration in whole milliseconds, for the countdown tween. */
    fun computeMillis(effects: StoryEffects?): Int = (computeSeconds(effects) * 1000.0).roundToInt()

    /**
     * The content-derived duration (no author override) — the "longest data wins"
     * rule. Extracted to mirror iOS's `contentDerivedDuration`, which the same
     * three arrays feed from both a slide and the live timeline project.
     */
    fun contentDerivedSeconds(
        mediaObjects: List<StoryMediaObject>?,
        audioPlayerObjects: List<StoryAudioPlayerObject>?,
        textObjects: List<StoryTextObject>,
    ): Double {
        val bgVideoDur = mediaObjects
            ?.firstOrNull { it.isBackground && it.mediaType.equals("video", ignoreCase = true) }
            ?.duration
        val bgAudioDur = audioPlayerObjects
            ?.firstOrNull { it.isBackground == true }
            ?.duration
            ?.toDouble()

        val totalWords = textObjects.sumOf { obj -> obj.text.split(" ").count { it.isNotEmpty() } }
        val textDur =
            if (totalWords <= LONG_TEXT_THRESHOLD_WORDS) {
                DEFAULT_STATIC_SECONDS
            } else {
                DEFAULT_STATIC_SECONDS + (totalWords - LONG_TEXT_THRESHOLD_WORDS) * LONG_TEXT_SECONDS_PER_WORD
            }

        val mediaWindows = mediaObjects.orEmpty()
            .mapNotNull { media -> media.duration?.let { (media.startTime ?: 0.0) + it } }
        val audioWindows = audioPlayerObjects.orEmpty()
            .mapNotNull { audio -> audio.duration?.let { (audio.startTime?.toDouble() ?: 0.0) + it.toDouble() } }
        val longestData = (mediaWindows + audioWindows).maxOrNull() ?: 0.0

        val target = maxOf(textDur, DEFAULT_STATIC_SECONDS, longestData)

        val bgResult = listOfNotNull(bgVideoDur, bgAudioDur)
            .filter { it > 0.001 }
            .fold(target) { effective, period ->
                val extended = if (period >= target) period else ceil(target / period) * period
                maxOf(effective, extended)
            }

        return maxOf(bgResult, longestData)
    }
}
