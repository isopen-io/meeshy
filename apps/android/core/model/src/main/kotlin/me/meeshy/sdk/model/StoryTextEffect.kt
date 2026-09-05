package me.meeshy.sdk.model

/**
 * The EFFECT axis of a story text — what sits ON TOP of the font (#4870):
 * the Android port of iOS `StoryTextEffect` (`StoryTextEffect.swift`) and
 * the twin of the web `lib/story-text-effect.ts`.
 *
 * `textStyle` picks a FONT and nothing else (#4850). What GLOWS or CASTS A
 * SHADOW is this second, orthogonal axis. Before it existed, this client made
 * "neon" glow (`StoryTextTypography.glow`) while iOS — where the story is
 * composed — never did: an effect hidden behind a font name, different per
 * client. The glow now lives here, and here only.
 *
 * [wire] is the exact gateway string (`StoryTextObject.textEffect`); an
 * absent field is [NONE]. The shadow table is in fractions of the font size
 * (em) and is copied VERBATIM across the three mirrors — any change touches
 * all three. [StoryTextEffectShadow.blurEm] is the CSS blur radius; Compose
 * takes it as-is.
 */
enum class StoryTextEffect(val wire: String, val shadow: StoryTextEffectShadow?) {
    NONE("none", null),

    // --- Glows: the TEXT ink, no offset

    /** A halo in the text colour, no offset. */
    GLOW("glow", StoryTextEffectShadow(0.0, 0.0, 0.36, StoryTextEffectInk.TEXT, 1.0)),

    /** The same halo, half-voiced — for light text on a light ground. */
    GLOW_SOFT("glowSoft", StoryTextEffectShadow(0.0, 0.0, 0.24, StoryTextEffectInk.TEXT, 0.55)),

    /** A very wide, half-voiced glow — the text does not shine, it BATHES. */
    AURA("aura", StoryTextEffectShadow(0.0, 0.0, 0.85, StoryTextEffectInk.TEXT, 0.45)),

    /** A wide, full glow: the neon sign. */
    NEON("neon", StoryTextEffectShadow(0.0, 0.0, 0.60, StoryTextEffectInk.TEXT, 1.0)),

    // --- Coloured neons: the ink belongs to the EFFECT, not to the text

    /** Pink neon — the most recognisable of the family. */
    NEON_PINK("neonPink", StoryTextEffectShadow(0.0, 0.0, 0.55, StoryTextEffectInk.Tint("FF2D95"), 1.0)),

    /** Cyan neon — the cold counterpoint to the pink. */
    NEON_CYAN("neonCyan", StoryTextEffectShadow(0.0, 0.0, 0.55, StoryTextEffectInk.Tint("22D3EE"), 1.0)),

    /** Violet neon — the brand hue, as a halo. */
    NEON_VIOLET("neonViolet", StoryTextEffectShadow(0.0, 0.0, 0.55, StoryTextEffectInk.Tint("A855F7"), 1.0)),

    /** A tighter golden halo: the warm lettering of a poster. */
    GOLD("gold", StoryTextEffectShadow(0.0, 0.0, 0.32, StoryTextEffectInk.Tint("FFC857"), 0.95)),

    /** Ember — a slightly falling orange glow, like firelight. */
    FIRE("fire", StoryTextEffectShadow(0.0, 0.04, 0.42, StoryTextEffectInk.Tint("FF6A00"), 0.9)),

    // --- Outlines: the DARK ink, no offset

    /** A diffuse dark halo all around — the text holds on a busy light ground. */
    HALO("halo", StoryTextEffectShadow(0.0, 0.0, 0.30, StoryTextEffectInk.DARK, 0.75)),

    /** A TIGHT dark halo — the eye reads it as an outline. */
    OUTLINE("outline", StoryTextEffectShadow(0.0, 0.0, 0.09, StoryTextEffectInk.DARK, 1.0)),

    /** The outline in LIGHT ink — the only one that holds dark text on a dark photo. */
    OUTLINE_LIGHT("outlineLight", StoryTextEffectShadow(0.0, 0.0, 0.07, StoryTextEffectInk.LIGHT, 1.0)),

    // --- Shadows: the DARK ink, offset

    /** A soft black drop shadow, offset downwards. */
    SHADOW("shadow", StoryTextEffectShadow(0.03, 0.06, 0.16, StoryTextEffectInk.DARK, 0.6)),

    /** The same, diffused and half-voiced: it DETACHES without being seen. */
    SHADOW_SOFT("shadowSoft", StoryTextEffectShadow(0.02, 0.04, 0.28, StoryTextEffectInk.DARK, 0.45)),

    /** A hard, dense drop shadow. */
    DROP("drop", StoryTextEffectShadow(0.06, 0.10, 0.08, StoryTextEffectInk.DARK, 0.75)),

    /** A shadow centred UNDER the text: it does not shift, it LIFTS. */
    LIFT("lift", StoryTextEffectShadow(0.0, 0.10, 0.22, StoryTextEffectInk.DARK, 0.45)),

    /** A hard shadow cast SIDEWAYS, no descent — raking light. */
    SIDE_SHADOW("sideShadow", StoryTextEffectShadow(0.08, 0.0, 0.03, StoryTextEffectInk.DARK, 0.7)),

    /** A low, diffuse shadow with no lateral offset: the text FLOATS. */
    FLOAT("float", StoryTextEffectShadow(0.0, 0.18, 0.30, StoryTextEffectInk.DARK, 0.32)),

    /** A long diagonal shadow, no blur — poster depth. */
    LONG_SHADOW("longShadow", StoryTextEffectShadow(0.14, 0.14, 0.0, StoryTextEffectInk.DARK, 0.35)),

    // --- Reliefs: the text looks carved

    /** A hard offset shadow, no blur — the text stands out as if cut out. */
    RELIEF("relief", StoryTextEffectShadow(0.05, 0.05, 0.0, StoryTextEffectInk.DARK, 0.85)),

    /** Light at the top left: the text comes OUT of the surface. */
    EMBOSS("emboss", StoryTextEffectShadow(-0.03, -0.03, 0.02, StoryTextEffectInk.LIGHT, 0.7)),

    /** Light just below: the text goes INTO the surface (letterpress). */
    LETTERPRESS("letterpress", StoryTextEffectShadow(0.0, 0.025, 0.01, StoryTextEffectInk.LIGHT, 0.6)),

    /** A displaced double in the text's OWN colour — the screen-print echo. */
    ECHO("echo", StoryTextEffectShadow(0.09, 0.09, 0.0, StoryTextEffectInk.TEXT, 0.35)),

    /** The echo pushed far and nearly erased — the trace, not the double. */
    GHOST("ghost", StoryTextEffectShadow(0.16, 0.16, 0.06, StoryTextEffectInk.TEXT, 0.22)),
    ;

    /** The wire value to publish, or `null` for [NONE] — a text without effect keeps the JSON it had. */
    val wireOrNull: String? get() = wire.takeIf { this != NONE }

    companion object {
        /**
         * Parity with iOS `parsedTextEffect`: an absent or unknown value (a newer client) is
         * [NONE], never an exception — the text renders without its effect rather than not at all.
         */
        fun fromWire(raw: String?): StoryTextEffect = entries.firstOrNull { it.wire == raw } ?: NONE
    }
}

/**
 * The shadow of a [StoryTextEffect], in fractions of the font size (em). Positive
 * [offsetYEm] points DOWN — the convention of Compose, CSS and UIKit alike.
 */
data class StoryTextEffectShadow(
    val offsetXEm: Double,
    val offsetYEm: Double,
    val blurEm: Double,
    /** The shadow ink — see [StoryTextEffectInk]. */
    val ink: StoryTextEffectInk,
    val opacity: Double,
)

/**
 * The ink of an effect shadow — three values, not a boolean (#5244).
 *
 * The field was `usesTextColor: Boolean`, and that boolean blocked a third of
 * the classic effects: `EMBOSS` and `LETTERPRESS` only read with a LIGHT
 * highlight on one side of the glyph, which "text colour OR black" cannot say.
 *
 * This is NOT on the wire: the v3 payload carries the effect NAME only
 * (`StoryTextObject.textEffect`), never its table. Widening the ink therefore
 * touches no schema, no version and no migration — only the three render
 * mirrors, which must stay identical.
 */
sealed interface StoryTextEffectInk {
    /** The TEXT's own colour — the glows. */
    data object Text : StoryTextEffectInk

    /** Black — shadows, outlines, dark reliefs. */
    data object Dark : StoryTextEffectInk

    /** White — the highlight of a carved relief. */
    data object Light : StoryTextEffectInk

    /**
     * A colour that belongs to the EFFECT itself, as six hex digits (2026-09-05).
     *
     * The three semantic inks can only say "someone else's colour". What makes a
     * neon sign recognisable is not that it glows but that it glows PINK,
     * whatever colour the text is — and tinting the text instead loses the pale
     * core of the glyph, which IS the neon.
     */
    data class Tint(val hex: String) : StoryTextEffectInk

    companion object {
        /** The three SEMANTIC inks — the ones that borrow their colour. Tints do not enumerate. */
        val semantic: List<StoryTextEffectInk> = listOf(Text, Dark, Light)
    }
}
