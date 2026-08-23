package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure base-direction resolver — the Android port of the way iOS
 * derives a story text object's writing direction from its content at render time (there is
 * no direction field on the wire `StoryTextObject`, so every client re-derives it). No
 * Android, no I/O: the Unicode Bidi P2/P3 "first strong character" rule lives in one
 * unit-tested place so the composer canvas and any future viewer stay glue.
 */
@RunWith(JUnit4::class)
class StoryTextDirectionTest {

    // --- no strong character: default LTR ---

    @Test
    fun `empty text resolves left-to-right`() {
        assertThat(StoryTextBidi.resolveBaseDirection("")).isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `digits-only text has no strong character and resolves left-to-right`() {
        assertThat(StoryTextBidi.resolveBaseDirection("12345 67.89")).isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `emoji-only text has no strong character and resolves left-to-right`() {
        assertThat(StoryTextBidi.resolveBaseDirection("😀🎉🌍")).isEqualTo(StoryTextDirection.LTR)
    }

    // --- first strong is left-to-right ---

    @Test
    fun `latin text resolves left-to-right`() {
        assertThat(StoryTextBidi.resolveBaseDirection("Bonjour")).isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `latin before arabic still resolves left-to-right - the first strong wins`() {
        assertThat(StoryTextBidi.resolveBaseDirection("Hi مرحبا")).isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `a leading left-to-right mark resolves left-to-right even before arabic`() {
        // U+200E LRM is a strong L: it fixes the base direction ahead of the Arabic run.
        assertThat(StoryTextBidi.resolveBaseDirection("‎مرحبا")).isEqualTo(StoryTextDirection.LTR)
    }

    // --- first strong is right-to-left (R) ---

    @Test
    fun `hebrew text resolves right-to-left`() {
        assertThat(StoryTextBidi.resolveBaseDirection("שלום")).isEqualTo(StoryTextDirection.RTL)
    }

    @Test
    fun `a leading right-to-left mark resolves right-to-left`() {
        // U+200F RLM is a strong R with no visible glyph.
        assertThat(StoryTextBidi.resolveBaseDirection("‏123")).isEqualTo(StoryTextDirection.RTL)
    }

    // --- first strong is right-to-left arabic (AL) ---

    @Test
    fun `arabic text resolves right-to-left`() {
        assertThat(StoryTextBidi.resolveBaseDirection("مرحبا")).isEqualTo(StoryTextDirection.RTL)
    }

    @Test
    fun `an arabic letter mark resolves right-to-left`() {
        // U+061C ALM is a strong AL.
        assertThat(StoryTextBidi.resolveBaseDirection("؜99")).isEqualTo(StoryTextDirection.RTL)
    }

    @Test
    fun `arabic before latin resolves right-to-left - the first strong wins`() {
        assertThat(StoryTextBidi.resolveBaseDirection("مرحبا Hi")).isEqualTo(StoryTextDirection.RTL)
    }

    // --- neutrals are skipped until the first strong ---

    @Test
    fun `leading whitespace and punctuation are skipped to the first strong arabic`() {
        assertThat(StoryTextBidi.resolveBaseDirection("  \"مرحبا\"")).isEqualTo(StoryTextDirection.RTL)
    }

    @Test
    fun `leading digits are skipped to the first strong hebrew`() {
        assertThat(StoryTextBidi.resolveBaseDirection("42 שלום")).isEqualTo(StoryTextDirection.RTL)
    }

    // --- supplementary-plane (surrogate-pair) strong character ---

    @Test
    fun `a right-to-left character in the supplementary plane resolves right-to-left`() {
        // U+1E900 ADLAM CAPITAL ALIF is a strong R encoded as a surrogate pair.
        assertThat(StoryTextBidi.resolveBaseDirection("𞤀xyz")).isEqualTo(StoryTextDirection.RTL)
    }

    // --- directional isolates: their content is skipped for the base direction ---

    @Test
    fun `arabic inside an isolate does not decide the base direction - the latin after it does`() {
        // RLI … PDI wraps the Arabic; the first strong OUTSIDE the isolate is the Latin.
        assertThat(StoryTextBidi.resolveBaseDirection("⁧مرحبا⁩abc"))
            .isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `a first-strong isolate around the only strong text leaves the base left-to-right`() {
        // FSI … PDI hides the Arabic; nothing strong remains at the paragraph level.
        assertThat(StoryTextBidi.resolveBaseDirection("⁨مرحبا⁩"))
            .isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `an unmatched pop-isolate is ignored and the following strong still decides`() {
        // A stray PDI at depth 0 must not corrupt the scan: the Hebrew after it wins.
        assertThat(StoryTextBidi.resolveBaseDirection("⁩שלום"))
            .isEqualTo(StoryTextDirection.RTL)
    }
}
