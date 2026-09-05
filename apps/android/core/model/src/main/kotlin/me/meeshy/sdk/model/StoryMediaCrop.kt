package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * A media object's **crop bounds**, in fractions of the source — the Kotlin port of
 * `MediaCropRect` (Swift) and of `MediaCropRect` in `@meeshy/shared/utils/media-crop`.
 *
 * ## Why this type exists at all
 *
 * The crop model was born on iOS and travelled for a whole lot **with no reader
 * anywhere else**: `canvas-v3.ts` declares an object's payload
 * `z.record(z.string(), z.unknown())` — permissive BY CONTRACT — so the four keys
 * passed validation, reached the web and Android, and were read by nobody.
 *
 * **An image cropped on iOS rendered WHOLE on the other two clients**, and nothing
 * could turn red: a permissive schema has no site at which to refuse, and a reader
 * that ignores a field is indistinguishable from one that never received it.
 *
 * ## Two wire shapes, one meaning
 *
 * | wire | shape | written by |
 * |---|---|---|
 * | v1 `StoryEffects` | nested `crop: { x, y, width, height }` | `StoryModels.swift` |
 * | canvas-v3 payload | flat `cropX` / `cropY` / `cropW` / `cropH` | `CanvasV3Migration.swift` |
 *
 * The four bounds are read **together or not at all**. A crop missing one bound has
 * no sensible fallback: completing it would fabricate a framing nobody posed, and
 * make it indistinguishable from a real one — the worst of both, since it would look
 * like an intention.
 */
@Serializable
data class StoryMediaCrop(
    val x: Double = 0.0,
    val y: Double = 0.0,
    val width: Double = 1.0,
    val height: Double = 1.0,
) {
    /** The whole source — the absence of a crop, expressed. */
    val isFull: Boolean get() = x == 0.0 && y == 0.0 && width == 1.0 && height == 1.0

    companion object {
        /**
         * One per cent of the source. Below that the author no longer sees what they
         * frame. The same number as `MediaCropRule.minimumSide` (Swift) and
         * `MINIMUM_CROP_SIDE` (TS) — three different floors would produce three
         * different bands for one gesture.
         */
        const val MINIMUM_SIDE: Double = 0.01

        val FULL: StoryMediaCrop = StoryMediaCrop()

        /**
         * Brings a rectangle back INSIDE the source.
         *
         * **The ORIGIN is bounded so that the floor HOLDS.** Written naively — origin
         * clamped to `1`, then the dimension clamped to `1 - origin` — the second bound
         * UNDOES the first: at `y == 1`, `min(max(0.01, h), 0)` yields `0`, which is
         * exactly the invisible media the floor exists to prevent. That defect lived in
         * the Swift original until 2026-09-04, and only the TypeScript port found it:
         * witnesses that use an INTERNAL origin agree in both worlds.
         */
        fun clamped(crop: StoryMediaCrop): StoryMediaCrop {
            val room = 1.0 - MINIMUM_SIDE
            val x = crop.x.coerceIn(0.0, room)
            val y = crop.y.coerceIn(0.0, room)
            return StoryMediaCrop(
                x = x,
                y = y,
                width = crop.width.coerceIn(MINIMUM_SIDE, 1.0 - x),
                height = crop.height.coerceIn(MINIMUM_SIDE, 1.0 - y),
            )
        }

        /**
         * Reads the canvas-v3 flat bounds. Returns `null` — "no crop" — in three cases
         * that are the SAME fact: no keys, partial keys, or a full crop. Distinguishing
         * them at the call site would force every caller to know the wire shape, which
         * is what this type exists to spare them.
         */
        fun fromPayloadBounds(x: Double?, y: Double?, width: Double?, height: Double?): StoryMediaCrop? {
            if (x == null || y == null || width == null || height == null) return null
            if (!x.isFinite() || !y.isFinite() || !width.isFinite() || !height.isFinite()) return null
            val bounded = clamped(StoryMediaCrop(x, y, width, height))
            return if (bounded.isFull) null else bounded
        }

        /**
         * The **effective** aspect ratio of a cropped media. A cropped media no longer
         * has its file's proportions, and this is the number a card must adopt — never
         * `aspectRatio`.
         */
        fun effectiveRatio(sourceRatio: Double, crop: StoryMediaCrop?): Double {
            if (crop == null || crop.isFull || crop.height <= 0.0) return sourceRatio
            return sourceRatio * (crop.width / crop.height)
        }
    }
}
