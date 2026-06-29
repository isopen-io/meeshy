package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryTextObject

/**
 * The visual style of an on-canvas text element — parity with the iOS
 * `StoryTextStyle` cases (bold / neon / typewriter / handwriting / classic). The
 * [wire] string is exactly what the gateway expects on `StoryTextObject.textStyle`,
 * so the UI never hardcodes the literal.
 */
enum class StoryTextStyle(val wire: String) {
    BOLD("bold"),
    NEON("neon"),
    TYPEWRITER("typewriter"),
    HANDWRITING("handwriting"),
    CLASSIC("classic"),
}

/**
 * Horizontal alignment of a text element's lines — parity with the iOS
 * `textAlign` values. [wire] is the exact gateway string.
 */
enum class StoryTextAlign(val wire: String) {
    LEFT("left"),
    CENTER("center"),
    RIGHT("right"),
}

/**
 * The font family family-class a style renders in. Kept as a pure token (no Compose
 * type) so the style→typography decision is unit-testable on the JVM; the Composable
 * maps each token to the matching `FontFamily` at the glue layer.
 */
enum class StoryTextFontFamily {
    SANS,
    SERIF,
    MONOSPACE,
    CURSIVE,
}

/**
 * The pure, Compose-agnostic typography of a [StoryTextStyle]: the weight, slant,
 * family-class, letter tracking, and whether the style carries a neon glow. This is
 * the single source of truth for how each style looks — the on-canvas Composable and
 * (later) the viewer reader both consume it, so the rendering decision is tested in
 * one place and never duplicated across surfaces.
 *
 * [fontWeight] is the standard 100..900 axis; [letterSpacingEm] is em-relative
 * tracking (never negative).
 */
data class StoryTextTypography(
    val fontWeight: Int,
    val italic: Boolean,
    val family: StoryTextFontFamily,
    val letterSpacingEm: Float,
    val glow: Boolean,
)

/**
 * Maps a style to its [StoryTextTypography] — the iOS-parity look of each of the five
 * cases. Total over the enum so the canvas Composable stays glue.
 */
fun StoryTextStyle.typography(): StoryTextTypography = when (this) {
    StoryTextStyle.BOLD -> StoryTextTypography(
        fontWeight = 800,
        italic = false,
        family = StoryTextFontFamily.SANS,
        letterSpacingEm = 0f,
        glow = false,
    )
    StoryTextStyle.NEON -> StoryTextTypography(
        fontWeight = 700,
        italic = false,
        family = StoryTextFontFamily.SANS,
        letterSpacingEm = 0.05f,
        glow = true,
    )
    StoryTextStyle.TYPEWRITER -> StoryTextTypography(
        fontWeight = 500,
        italic = false,
        family = StoryTextFontFamily.MONOSPACE,
        letterSpacingEm = 0.03f,
        glow = false,
    )
    StoryTextStyle.HANDWRITING -> StoryTextTypography(
        fontWeight = 400,
        italic = true,
        family = StoryTextFontFamily.CURSIVE,
        letterSpacingEm = 0f,
        glow = false,
    )
    StoryTextStyle.CLASSIC -> StoryTextTypography(
        fontWeight = 400,
        italic = false,
        family = StoryTextFontFamily.SERIF,
        letterSpacingEm = 0f,
        glow = false,
    )
}

/**
 * Pure, immutable model of one on-canvas text element of a story slide. Position
 * ([x]/[y]) is normalised to the canvas `0f..1f` (centre = `0.5, 0.5`), exactly as
 * iOS's `StoryTextObject`/`StoryTextPosition`, so it is resolution-independent and
 * rides straight into the wire request. The constructor never throws on an
 * out-of-range coordinate — [normalised] (and every mutator that moves the element)
 * clamps to the canvas — so the deck reducer and the canvas Composable can stay glue
 * while the clamp lives in one unit-tested place.
 *
 * This mirrors the per-slide media reducer: an element belongs to exactly one slide
 * and there is a per-slide cap ([StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE]).
 */
data class StoryTextElement(
    val id: String,
    val text: String = "",
    val style: StoryTextStyle = StoryTextStyle.BOLD,
    val color: String = DEFAULT_COLOR,
    val align: StoryTextAlign = StoryTextAlign.CENTER,
    val x: Float = CENTER,
    val y: Float = CENTER,
) {
    /** True once the element carries content worth publishing (non-blank text). */
    val isPublishable: Boolean get() = text.isNotBlank()

    /** A copy with [x]/[y] clamped into the canvas `0f..1f`, leaving everything else. */
    fun normalised(): StoryTextElement = copy(x = clampCoord(x), y = clampCoord(y))

    /**
     * Translates the element by the normalised deltas [dx]/[dy] (canvas fractions),
     * clamping the result back into `0f..1f` so the element can never be dragged off
     * its own canvas. The Composable converts drag pixels to fractions (a trivial
     * `px / size`); the clamp — the only real rule — lives here.
     */
    fun nudged(dx: Float, dy: Float): StoryTextElement =
        copy(x = clampCoord(x + dx), y = clampCoord(y + dy))

    /**
     * Maps to the create-story wire object. [sourceLanguage] is the publisher's
     * resolved content language (Prisme) so the gateway can seed translations.
     * Only the fields this composer slice owns are set; the rest take the model's
     * gateway-parity defaults.
     */
    fun toTextObject(sourceLanguage: String): StoryTextObject = StoryTextObject(
        id = id,
        text = text,
        x = x.toDouble(),
        y = y.toDouble(),
        textStyle = style.wire,
        textColor = color,
        textAlign = align.wire,
        sourceLanguage = sourceLanguage,
    )

    companion object {
        /** Normalised canvas centre — where a fresh element is born. */
        const val CENTER: Float = 0.5f

        /** Default text colour — white, hex without the leading `#` (gateway parity). */
        const val DEFAULT_COLOR: String = "FFFFFF"

        /** Clamps a normalised coordinate into the visible canvas `0f..1f`. */
        fun clampCoord(value: Float): Float = value.coerceIn(0f, 1f)
    }
}
