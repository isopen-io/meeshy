package me.meeshy.app.stories

import me.meeshy.sdk.model.StorySticker

/**
 * Pure, immutable model of one on-canvas emoji sticker of a story slide — parity
 * with the iOS `StorySticker` canvas object. Position ([x]/[y]) is normalised to the
 * canvas `0f..1f` (centre = `0.5, 0.5`) so it is resolution-independent and rides
 * straight into the wire request; [scale] and [rotationDeg] follow the exact same
 * clamp/wrap rules as a text element (a sticker can be pinched and twisted with the
 * same gesture). To keep the canvas-geometry rules in **one** place, this model
 * reuses [StoryTextElement]'s pure clamp helpers (`clampCoord`/`clampScale`/
 * `normaliseRotation`) — the single source of truth for how any on-canvas object
 * settles — rather than re-deriving them. The constructor never throws on an
 * out-of-range value: [normalised] (and every mutator that moves the sticker) pulls
 * it back into range, so the deck reducer and the canvas Composable stay glue.
 *
 * A sticker belongs to exactly one slide and there is a per-slide cap
 * ([StorySlideDeck.MAX_STICKERS_PER_SLIDE]).
 */
data class StoryStickerElement(
    val id: String,
    val emoji: String = "",
    val x: Float = StoryTextElement.CENTER,
    val y: Float = StoryTextElement.CENTER,
    val scale: Float = StoryTextElement.DEFAULT_SCALE,
    val rotationDeg: Float = StoryTextElement.DEFAULT_ROTATION,
) {
    /** True once the sticker carries content worth publishing (a non-blank emoji). */
    val isPublishable: Boolean get() = emoji.isNotBlank()

    /**
     * A copy with every continuous field pulled back into its legal range: [x]/[y]
     * clamped into the canvas `0f..1f`, [scale] clamped to
     * `[StoryTextElement.MIN_SCALE, StoryTextElement.MAX_SCALE]`, and [rotationDeg]
     * wrapped into `(-180, 180]`. Total even on a non-finite input (`NaN`/∞ collapse
     * to the field's neutral value), so the deck reducer and the canvas stay glue.
     */
    fun normalised(): StoryStickerElement = copy(
        x = StoryTextElement.clampCoord(x),
        y = StoryTextElement.clampCoord(y),
        scale = StoryTextElement.clampScale(scale),
        rotationDeg = StoryTextElement.normaliseRotation(rotationDeg),
    )

    /**
     * Applies one incremental pinch/rotate gesture: multiplies [scale] by the
     * gesture's [scaleBy] factor (clamped) and adds [rotateByDeg] to [rotationDeg]
     * (wrapped), leaving the position and emoji untouched. A degenerate factor
     * (`scaleBy <= 0`, `NaN`) collapses to the neutral scale rather than producing a
     * broken sticker.
     */
    fun transformed(scaleBy: Float, rotateByDeg: Float): StoryStickerElement = copy(
        scale = StoryTextElement.clampScale(scale * scaleBy),
        rotationDeg = StoryTextElement.normaliseRotation(rotationDeg + rotateByDeg),
    )

    /**
     * Translates the sticker by the normalised deltas [dx]/[dy] (canvas fractions),
     * clamping the result back into `0f..1f` so it can never be dragged off its own
     * canvas. The Composable converts drag pixels to fractions; the clamp lives here.
     */
    fun nudged(dx: Float, dy: Float): StoryStickerElement =
        copy(x = StoryTextElement.clampCoord(x + dx), y = StoryTextElement.clampCoord(y + dy))

    /**
     * Maps to the create-story wire object. Only the fields this composer slice owns
     * are set; the rest (anchor, base size, timing) take the model's gateway-parity
     * defaults — `baseSize` defaults to iOS's `140.0`.
     */
    fun toSticker(): StorySticker = StorySticker(
        id = id,
        emoji = emoji,
        x = x.toDouble(),
        y = y.toDouble(),
        scale = scale.toDouble(),
        rotation = rotationDeg.toDouble(),
    )
}
