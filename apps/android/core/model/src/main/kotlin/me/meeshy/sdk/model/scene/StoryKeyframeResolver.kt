package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe

/**
 * The animated transform of a canvas clip at one playback instant. Every channel
 * is fully resolved: a channel with no keyframes falls back to the clip's static
 * base value, so a caller can read `x`/`y`/`scale`/`opacity` unconditionally.
 */
data class ResolvedKeyframeTransform(
    val x: Double,
    val y: Double,
    val scale: Double,
    val opacity: Double,
)

/**
 * Pure resolver applying keyframe interpolation to a canvas clip — the Android
 * port of iOS's `ReaderKeyframeResolver` (`MeeshyUI/Story/Canvas/StoryReaderResolvers.swift`).
 *
 * A wire [StoryKeyframe] carries four independently-optional channels (`x`, `y`,
 * `scale`, `opacity`); a point that keys only one leaves the others `null`, and
 * that channel is then ignored — exactly as a position-only point ignores scale.
 * Each present channel is projected onto its own [KeyframeChannelSample] list and
 * handed to [StoryKeyframeInterpolator]. **Before a channel's first keyframe it yields
 * to the base value** (no jump at the start of the clip).
 *
 * **Deliberate improvement over iOS.** iOS subtracts the clip's `startTime` from
 * the playhead for the *position* channel but forgets to for `scale`/`opacity`
 * (`StoryReaderResolvers.swift:117-138` pass raw `currentTime`). Per the timeline
 * spec §2.1, `keyframe.time` is an offset relative to the clip's `startTime` for
 * *every* channel, so this port subtracts `startTime` uniformly. A clip that
 * starts at 0 (the common case) is unaffected; a shifted clip now animates its
 * scale/opacity on the same clock as its position instead of ahead of it.
 */
object StoryKeyframeResolver {

    /**
     * Resolves the transform at [currentTime] (seconds, absolute playhead), or
     * `null` when there is nothing to animate — no keyframes at all, or none that
     * keys any channel. When non-null, un-keyed channels carry the supplied base
     * values so the result is always a complete transform.
     */
    fun resolve(
        keyframes: List<StoryKeyframe>?,
        currentTime: Float,
        startTime: Float = 0f,
        baseX: Double = 0.5,
        baseY: Double = 0.5,
        baseScale: Double = 1.0,
        baseOpacity: Double = 1.0,
    ): ResolvedKeyframeTransform? {
        val frames = keyframes?.takeIf { it.isNotEmpty() } ?: return null
        val local = currentTime - startTime

        val x = frames.heldChannel(local) { it.x }
        val y = frames.heldChannel(local) { it.y }
        val scale = frames.heldChannel(local) { it.scale }
        val opacity = frames.heldChannel(local) { it.opacity }

        if (x == null && y == null && scale == null && opacity == null) return null

        return ResolvedKeyframeTransform(
            x = x ?: baseX,
            y = y ?: baseY,
            scale = scale ?: baseScale,
            opacity = opacity ?: baseOpacity,
        )
    }

    /**
     * Valeur d'un canal à l'instant local [local], ou `null` AVANT sa première keyframe : le
     * canal garde alors la valeur de base de l'objet (miroir de `applyKeyframes` iOS). Chaque
     * canal (x, y, échelle, opacité) est armé indépendamment — un texte peut animer son échelle
     * dès t = 1 et son opacité dès t = 0. Sans ce maintien, l'objet sautait à la première valeur
     * keyframée dès t = 0.
     */
    private inline fun List<StoryKeyframe>.heldChannel(
        local: Float,
        select: (StoryKeyframe) -> Double?,
    ): Double? {
        val samples = channel(select)
        val first = samples.minOfOrNull { it.time } ?: return null
        if (local < first) return null
        return StoryKeyframeInterpolator.interpolate(samples, local)
    }

    private inline fun List<StoryKeyframe>.channel(
        select: (StoryKeyframe) -> Double?,
    ): List<KeyframeChannelSample> = mapNotNull { keyframe ->
        select(keyframe)?.let {
            KeyframeChannelSample(keyframe.time, it, keyframe.easing ?: StoryEasing.LINEAR)
        }
    }
}
