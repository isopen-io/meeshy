package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryTextBackgroundStyle

/**
 * The pure, Compose-agnostic backing of an on-canvas text element — parity with the
 * iOS `StoryTextBackgroundStyle` enum (`.none` / `.solid(hex:)` / `.glass(radius:)`).
 *
 * Modelled as a sealed hierarchy (not the stringly-typed wire [StoryTextBackgroundStyle]
 * `{ type, hex?, radius? }`) so the composer reasons over an exhaustive set: adding a
 * case forces every `when` to acknowledge it, and an impossible state (a `solid` with a
 * `radius`, a `glass` with a `hex`) is simply unrepresentable. The wire mapping lives in
 * [toStyleWire] so the tagged-union encoding is decided in one unit-tested place and the
 * canvas Composable that paints the backing stays glue.
 */
sealed interface StoryTextBackground {
    /** No backing — the text floats directly on the canvas. */
    data object None : StoryTextBackground

    /** A solid colour behind the glyphs. [hex] is `RRGGBB` or `RRGGBBAA` (gateway parity, no `#`). */
    data class Solid(val hex: String) : StoryTextBackground

    /** A frosted-glass backing that blurs the canvas beneath. [radius] is the blur sigma. */
    data class Glass(val radius: Double) : StoryTextBackground

    /**
     * Maps to the gateway [StoryTextBackgroundStyle] tagged union, or `null` when there is
     * no backing. [None] projects to `null` (an absent `backgroundStyle` is how the gateway
     * spells "no background" — the field defaults null and `resolvedBackgroundStyle` reads it
     * as none), keeping the wire payload minimal; [Solid]/[Glass] carry only their own field.
     * Mirrors iOS, which also purges the legacy `textBg` when it writes `backgroundStyle`
     * (Android never sets `textBg`, so there is nothing to purge).
     */
    fun toStyleWire(): StoryTextBackgroundStyle? = when (this) {
        None -> null
        is Solid -> StoryTextBackgroundStyle(type = "solid", hex = hex)
        is Glass -> StoryTextBackgroundStyle(type = "glass", radius = radius)
    }

    companion object {
        /** The default glass blur sigma offered by the picker — parity with iOS `.glass(radius: 24)`. */
        const val DEFAULT_GLASS_RADIUS: Double = 24.0

        /**
         * The effective backing for a wire text object, honouring backward compatibility —
         * the reader-side port of iOS `StoryTextObject.resolvedBackgroundStyle`
         * (`StoryModels.swift`). Priority: the modern [backgroundStyle] (new) > the legacy
         * [textBg] hex → [Solid] > [None]. The modern style WINS even when it resolves to
         * [None] (an explicit `type: "none"` suppresses a stale legacy `textBg`), so this is
         * the exact inverse of [toStyleWire] and never double-counts a backing.
         *
         * Decodes TOLERANTLY, mirroring the rest of the story wire decoders: a [Solid] with no
         * usable hex, an unknown `type`, or a blank legacy hex all decay to [None] rather than
         * render a colourless box; a [Glass] whose radius is absent/non-finite/non-positive keeps
         * the author's glass intent and clamps the sigma to [DEFAULT_GLASS_RADIUS].
         */
        fun resolve(backgroundStyle: StoryTextBackgroundStyle?, textBg: String?): StoryTextBackground {
            backgroundStyle?.let { return fromWire(it) }
            val legacy = textBg?.takeIf { it.isNotBlank() } ?: return None
            return Solid(hex = legacy)
        }

        private fun fromWire(style: StoryTextBackgroundStyle): StoryTextBackground = when (style.type) {
            "solid" -> style.hex?.takeIf { it.isNotBlank() }?.let { Solid(hex = it) } ?: None
            "glass" -> {
                val radius = style.radius?.takeIf { it.isFinite() && it > 0.0 } ?: DEFAULT_GLASS_RADIUS
                Glass(radius = radius)
            }
            else -> None
        }
    }
}

/**
 * The text-backing choices the composer offers, in the exact order and values of the iOS
 * `StoryTextBackgroundPresets.all` — a single ordered source of truth the picker chips and
 * the (pure) tap-cycle both read, so they can never diverge on the first backing added.
 */
object StoryTextBackgroundPresets {
    val all: List<StoryTextBackground> = listOf(
        StoryTextBackground.None,
        StoryTextBackground.Glass(radius = 24.0),
        StoryTextBackground.Solid(hex = "000000"),
        StoryTextBackground.Solid(hex = "000000A6"),
        StoryTextBackground.Solid(hex = "FFFFFF"),
        StoryTextBackground.Solid(hex = "FFFFFFA6"),
        StoryTextBackground.Solid(hex = "6366F1"),
        StoryTextBackground.Solid(hex = "6366F1A6"),
        StoryTextBackground.Solid(hex = "F472B6"),
        StoryTextBackground.Solid(hex = "34D399"),
        StoryTextBackground.Solid(hex = "FBBF24"),
        StoryTextBackground.Solid(hex = "F87171"),
    )

    /**
     * The next backing after [current] in [all], wrapping past the end back to the first —
     * the pure port of iOS's tap-to-cycle (`firstIndex(of:) + 1 % count`). A [current] that
     * is not one of the presets (e.g. a colour picked outside the palette) restarts the cycle
     * at the first preset, so a tap always advances to a known, offerable value.
     */
    fun next(current: StoryTextBackground): StoryTextBackground {
        val index = all.indexOf(current)
        val nextIndex = if (index < 0) 0 else (index + 1) % all.size
        return all[nextIndex]
    }
}
