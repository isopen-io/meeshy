package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `StoryBackgroundValue` is the Android port of the iOS single source of truth for
 * the serialised colour background of a story slide (`StoryEffects.background`,
 * `packages/MeeshySDK/.../Models/StoryBackgroundValue.swift`). Two forms exist on
 * the wire: a bare `"RRGGBB"` solid colour, and `"gradient:RRGGBB:RRGGBB"` (a
 * two-colour linear gradient). The parse is deliberately TOLERANT — anything that
 * is not a well-formed gradient decays to a [StoryBackgroundValue.Hex] carrying the
 * *whole* raw string, so the renderer falls back to its solid-colour path exactly
 * as iOS does (never a half-parsed, wrong gradient). These tests pin the contract
 * so the two clients never drift.
 */
class StoryBackgroundValueTest {

    @Test
    fun `a bare hex string parses as a solid colour`() {
        assertThat(StoryBackgroundValue.parse("FF2E63")).isEqualTo(StoryBackgroundValue.Hex("FF2E63"))
    }

    @Test
    fun `a well-formed gradient parses to its two colours`() {
        assertThat(StoryBackgroundValue.parse("gradient:FF2E63:08D9D6"))
            .isEqualTo(StoryBackgroundValue.Gradient("FF2E63", "08D9D6"))
    }

    @Test
    fun `a gradient round-trips through serialisation`() {
        val g = StoryBackgroundValue.Gradient("9B59B6", "FF6B6B")
        assertThat(StoryBackgroundValue.parse(g.serialized())).isEqualTo(g)
    }

    @Test
    fun `a solid colour round-trips through serialisation`() {
        val h = StoryBackgroundValue.Hex("1E1B4B")
        assertThat(StoryBackgroundValue.parse(h.serialized())).isEqualTo(h)
    }

    @Test
    fun `a gradient serialises to the colon-separated wire form`() {
        assertThat(StoryBackgroundValue.Gradient("AABBCC", "DDEEFF").serialized())
            .isEqualTo("gradient:AABBCC:DDEEFF")
    }

    @Test
    fun `a gradient with only one colour decays to the whole raw hex`() {
        assertThat(StoryBackgroundValue.parse("gradient:FF2E63"))
            .isEqualTo(StoryBackgroundValue.Hex("gradient:FF2E63"))
    }

    @Test
    fun `a gradient with three colours decays to the whole raw hex`() {
        assertThat(StoryBackgroundValue.parse("gradient:FF2E63:08D9D6:00FF00"))
            .isEqualTo(StoryBackgroundValue.Hex("gradient:FF2E63:08D9D6:00FF00"))
    }

    @Test
    fun `a gradient with a non-hex colour decays to the whole raw hex`() {
        assertThat(StoryBackgroundValue.parse("gradient:ZZZZZZ:0000FF"))
            .isEqualTo(StoryBackgroundValue.Hex("gradient:ZZZZZZ:0000FF"))
    }

    @Test
    fun `a gradient with a short colour decays to the whole raw hex`() {
        assertThat(StoryBackgroundValue.parse("gradient:ZZZ"))
            .isEqualTo(StoryBackgroundValue.Hex("gradient:ZZZ"))
    }

    @Test
    fun `the comma-separated form is never read as a gradient`() {
        assertThat(StoryBackgroundValue.parse("gradient:FF0000,0000FF"))
            .isEqualTo(StoryBackgroundValue.Hex("gradient:FF0000,0000FF"))
    }

    @Test
    fun `a hash-prefixed solid colour is not read as a gradient`() {
        assertThat(StoryBackgroundValue.parse("#112233")).isEqualTo(StoryBackgroundValue.Hex("#112233"))
    }

    @Test
    fun `the bare gradient prefix with no colours decays to the whole raw hex`() {
        assertThat(StoryBackgroundValue.parse("gradient:"))
            .isEqualTo(StoryBackgroundValue.Hex("gradient:"))
    }

    /**
     * iOS parses with Swift `split(separator:)`, which omits empty subsequences, so
     * `gradient:FF0000::0000FF` yields two valid colours and IS a gradient. Kotlin's
     * `String.split` keeps the empty run, so the port must drop empties to stay in
     * lock-step — this case makes that drop load-bearing (mutation-RED anchor).
     */
    @Test
    fun `interior empty colour runs are dropped for iOS split parity`() {
        assertThat(StoryBackgroundValue.parse("gradient:FF0000::0000FF"))
            .isEqualTo(StoryBackgroundValue.Gradient("FF0000", "0000FF"))
    }

    @Test
    fun `lowercase hex colours are accepted in a gradient`() {
        assertThat(StoryBackgroundValue.parse("gradient:ff2e63:08d9d6"))
            .isEqualTo(StoryBackgroundValue.Gradient("ff2e63", "08d9d6"))
    }
}
