package me.meeshy.sdk.model

/**
 * The serialised colour background of a story slide (`StoryEffects.background`) —
 * the Android port of iOS's single source of truth
 * (`packages/MeeshySDK/.../Models/StoryBackgroundValue.swift`).
 *
 * Two wire forms (C11):
 *  - `"RRGGBB"` — a solid colour (the historical form, hex without `#`);
 *  - `"gradient:RRGGBB:RRGGBB"` — a two-colour linear gradient (top-leading →
 *    bottom-trailing, the brand-gradient convention the renderer paints).
 *
 * [parse] is deliberately TOLERANT: anything that is not a well-formed gradient
 * decays to [Hex] carrying the *whole* raw string, so the renderer falls back to
 * its solid-colour path (the historical behaviour for an invalid value) rather than
 * showing a half-parsed, wrong gradient. Pure: no colour objects, no rendering — the
 * hex→`Color` bridge stays in the Compose glue, so the parsing rule lives in one
 * unit-tested place shared by the viewer today and the composer tomorrow.
 */
sealed interface StoryBackgroundValue {

    /** A solid colour, hex without `#` (a possibly-degraded raw value on the fallback path). */
    data class Hex(val hex: String) : StoryBackgroundValue

    /** A two-colour linear gradient from [start] to [end] (both hex without `#`). */
    data class Gradient(val start: String, val end: String) : StoryBackgroundValue

    /** The wire string this value serialises to — the exact inverse of [parse] for a valid value. */
    fun serialized(): String = when (this) {
        is Hex -> hex
        is Gradient -> "$GRADIENT_PREFIX$start:$end"
    }

    companion object {
        private const val GRADIENT_PREFIX = "gradient:"

        /**
         * Parses a raw `StoryEffects.background` string. A value that does not start
         * with `gradient:`, or a `gradient:` value that does not carry exactly two
         * six-digit hex colours, decays to [Hex] with the whole raw string. Interior
         * empty colour runs are dropped to match Swift `split(separator:)`
         * (`omittingEmptySubsequences`), keeping the two clients in lock-step.
         */
        fun parse(raw: String): StoryBackgroundValue {
            if (!raw.startsWith(GRADIENT_PREFIX)) return Hex(raw)
            val parts = raw.substring(GRADIENT_PREFIX.length).split(":").filter { it.isNotEmpty() }
            if (parts.size == 2 && parts.all { it.length == 6 && it.all(::isHexDigit) }) {
                return Gradient(parts[0], parts[1])
            }
            return Hex(raw)
        }

        private fun isHexDigit(c: Char): Boolean =
            c in '0'..'9' || c in 'a'..'f' || c in 'A'..'F'
    }
}
