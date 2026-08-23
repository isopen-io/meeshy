package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryTransitionKind

/**
 * Pure resolver applying inter-clip transitions to a canvas clip's opacity at a
 * playback instant — the Android port of iOS's `ReaderTransitionResolver.opacity`
 * plus its canonical primitive `StoryRenderer.clipTransitionOpacity`
 * (`MeeshyUI/Story/Canvas/StoryReaderResolvers.swift` + `StoryRenderer.swift`).
 *
 * A slide's `clipTransitions` describe crossfades/dissolves between adjacent clips:
 * during a transition window the OUTGOING clip (`fromClipId`) fades from 1 → 0 and
 * the INCOMING clip (`toClipId`) fades from 0 → 1. The reader has no per-pixel
 * compositor, so a `dissolve` is DEGRADED to the same crossfade opacity ramp for
 * live playback (the MP4 exporter keeps the real per-pixel dissolve) — matching
 * iOS's `liveRenderableTransition`.
 */
object StoryClipTransitionResolver {

    /**
     * The canonical primitive — port of `StoryRenderer.clipTransitionOpacity`.
     * Returns the opacity `[0, 1]` for the clip [mediaId] at time [at], given a
     * transition window that opens at [transitionStart]. Only [StoryTransitionKind.CROSSFADE]
     * ramps; every other kind (and any zero-duration entry, defensively — iOS would
     * divide by zero) is opaque. Outside the window the clip is opaque (`1.0`).
     */
    fun crossfadeFactor(
        mediaId: String,
        transitions: List<StoryClipTransition>,
        transitionStart: Double,
        at: Double,
    ): Double {
        for (tr in transitions) {
            if (tr.kind != StoryTransitionKind.CROSSFADE) continue
            val duration = tr.duration.toDouble()
            if (duration <= 0.0) continue
            val inWindow = at >= transitionStart && at <= transitionStart + duration
            if (!inWindow) continue
            val progress = (at - transitionStart) / duration
            if (mediaId == tr.fromClipId) return 1.0 - progress
            if (mediaId == tr.toClipId) return progress
        }
        return 1.0
    }

    /**
     * The reader resolver — port of `ReaderTransitionResolver.opacity`. Returns the
     * rendered opacity `[0, 1]` for the clip [mediaId] at [currentTime], accounting
     * for its own timing window `[startTime, startTime + duration]` and any matching
     * [transitions]:
     *  - Outside the clip's own window the clip is invisible (`0.0`).
     *  - Each matching transition contributes a multiplicative crossfade factor: an
     *    OUTGOING clip fades over `[end - transitionDuration, end]`; an INCOMING clip
     *    fades over `[start, start + transitionDuration]`. Stacked transitions multiply.
     *  - `dissolve` is degraded to `crossfade` before the ramp is computed.
     */
    fun opacity(
        mediaId: String,
        startTime: Double,
        duration: Double,
        transitions: List<StoryClipTransition>,
        currentTime: Double,
    ): Double {
        val end = startTime + duration
        if (currentTime < startTime || currentTime > end) return 0.0

        var opacity = 1.0
        for (transition in transitions.map { it.liveRenderable() }) {
            val isOutgoing = transition.fromClipId == mediaId
            val isIncoming = transition.toClipId == mediaId
            if (!isOutgoing && !isIncoming) continue

            val transitionDuration = transition.duration.toDouble()
            val transitionStart = if (isOutgoing) end - transitionDuration else startTime
            opacity *= crossfadeFactor(mediaId, listOf(transition), transitionStart, currentTime)
        }
        return opacity.coerceIn(0.0, 1.0)
    }

    private fun StoryClipTransition.liveRenderable(): StoryClipTransition =
        if (kind == StoryTransitionKind.DISSOLVE) copy(kind = StoryTransitionKind.CROSSFADE) else this
}
