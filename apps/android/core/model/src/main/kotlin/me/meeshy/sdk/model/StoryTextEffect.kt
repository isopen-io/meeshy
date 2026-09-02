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

    /** A halo in the text colour, no offset. */
    GLOW("glow", StoryTextEffectShadow(offsetXEm = 0.0, offsetYEm = 0.0, blurEm = 0.36, usesTextColor = true, opacity = 1.0)),

    /** A soft black drop shadow, offset downwards. */
    SHADOW("shadow", StoryTextEffectShadow(offsetXEm = 0.03, offsetYEm = 0.06, blurEm = 0.16, usesTextColor = false, opacity = 0.6)),

    /** A hard offset shadow, no blur — the text stands out as if cut out. */
    RELIEF("relief", StoryTextEffectShadow(offsetXEm = 0.05, offsetYEm = 0.05, blurEm = 0.0, usesTextColor = false, opacity = 0.85)),
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
    /** `true` ⇒ the TEXT colour (glow); `false` ⇒ black. */
    val usesTextColor: Boolean,
    val opacity: Double,
)
