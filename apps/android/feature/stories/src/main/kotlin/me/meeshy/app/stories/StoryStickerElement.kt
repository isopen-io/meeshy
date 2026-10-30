package me.meeshy.app.stories

import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StickerDisplayRank
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.sdk.model.scene.StoryElementTiming

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
    val timing: StoryElementTiming = StoryElementTiming(),
    /** Le gabarit qui le dessine (#13847) — vide pour un emoji ou une image. */
    val templateId: String = "",
    /** Les valeurs des emplacements du gabarit (les mots, l'heure figée). */
    val slots: Map<String, String> = emptyMap(),
    /** Le média téléversé qui porte son image (Mee, pack, Mes stickers) ; vide tant qu'il n'est pas arrivé. */
    val postMediaId: String = "",
    /** D'où vient l'image (`mee`, `pack`, `library`), tel qu'iOS l'écrit. */
    val provider: String? = null,
    /** Ce que le canevas dessine : l'aperçu local pendant l'envoi, l'adresse servie ensuite. */
    val imageUrl: String? = null,
    /** Le mouvement, par son nom de fil. */
    val animation: String? = null,
) {
    /** Une image posée dont les octets ne sont pas encore arrivés : elle se voit, elle ne part pas. */
    val isAwaitingImage: Boolean get() = imageUrl != null && postMediaId.isBlank()

    /** True once the sticker carries content worth publishing — an emoji, a template or an arrived image. */
    val isPublishable: Boolean
        get() = !isAwaitingImage && (emoji.isNotBlank() || templateId.isNotBlank() || postMediaId.isNotBlank())

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
        emoji = StickerDisplayRank.wireEmoji(emoji = emoji, templateId = templateId, templateFallback = StickerTemplateCatalog::fallbackEmoji),
        postMediaId = postMediaId,
        provider = provider,
        templateId = templateId,
        slots = slots,
        animation = animation,
        x = x.toDouble(),
        y = y.toDouble(),
        scale = scale.toDouble(),
        rotation = rotationDeg.toDouble(),
        startTime = timing.startSeconds.takeIf { it > StoryElementTiming.NONE_SECONDS }?.toDouble(),
        duration = timing.durationSeconds.takeIf { it > StoryElementTiming.NONE_SECONDS }?.toDouble(),
    )
}
