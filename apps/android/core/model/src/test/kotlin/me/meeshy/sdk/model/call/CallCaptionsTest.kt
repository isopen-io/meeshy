package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the live in-call captions core: the [CaptionsMode] 3-state
 * cycle (iOS `CaptionsMode` parity) and the Prisme-faithful [CallCaptionResolver].
 * Everything here asserts observable behaviour through the public API — the mode
 * a tap advances to, and the exact line the overlay would render — never the
 * internal shape of the types.
 */
class CallCaptionsTest {

    private fun segment(
        text: String = "hello world",
        translatedText: String? = null,
        translatedLanguage: String? = null,
        speakerId: String = "u1",
        speakerName: String = "Ada",
        isLocal: Boolean = false,
    ) = CallCaptionSegment(
        speakerId = speakerId,
        speakerName = speakerName,
        isLocal = isLocal,
        text = text,
        translatedText = translatedText,
        translatedLanguage = translatedLanguage,
    )

    // --- CaptionsMode.from --------------------------------------------------

    @Test
    fun `not transcribing resolves to Off regardless of the show-original flag`() {
        assertThat(CaptionsMode.from(isTranscribing = false, showOriginalText = false)).isEqualTo(CaptionsMode.Off)
        assertThat(CaptionsMode.from(isTranscribing = false, showOriginalText = true)).isEqualTo(CaptionsMode.Off)
    }

    @Test
    fun `transcribing without show-original resolves to Translated`() {
        assertThat(CaptionsMode.from(isTranscribing = true, showOriginalText = false)).isEqualTo(CaptionsMode.Translated)
    }

    @Test
    fun `transcribing with show-original resolves to Original`() {
        assertThat(CaptionsMode.from(isTranscribing = true, showOriginalText = true)).isEqualTo(CaptionsMode.Original)
    }

    // --- CaptionsMode.next ---------------------------------------------------

    @Test
    fun `next turns captions on into Translated first, never straight to Original`() {
        assertThat(CaptionsMode.Off.next).isEqualTo(CaptionsMode.Translated)
    }

    @Test
    fun `next advances Translated to Original`() {
        assertThat(CaptionsMode.Translated.next).isEqualTo(CaptionsMode.Original)
    }

    @Test
    fun `next advances Original back to Off`() {
        assertThat(CaptionsMode.Original.next).isEqualTo(CaptionsMode.Off)
    }

    @Test
    fun `three taps from Off return to Off`() {
        assertThat(CaptionsMode.Off.next.next.next).isEqualTo(CaptionsMode.Off)
    }

    // --- CaptionsMode.isShowingCaptions -------------------------------------

    @Test
    fun `isShowingCaptions is false only when Off`() {
        assertThat(CaptionsMode.Off.isShowingCaptions).isFalse()
        assertThat(CaptionsMode.Translated.isShowingCaptions).isTrue()
        assertThat(CaptionsMode.Original.isShowingCaptions).isTrue()
    }

    // --- resolve: Off --------------------------------------------------------

    @Test
    fun `Off yields no line even for a fully populated segment`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "salut", translatedText = "hi", translatedLanguage = "en"),
            CaptionsMode.Off,
        )
        assertThat(line).isNull()
    }

    // --- resolve: Original ---------------------------------------------------

    @Test
    fun `Original shows the speaker's own words with no language tag`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "salut", translatedText = "hi", translatedLanguage = "en"),
            CaptionsMode.Original,
        )!!
        assertThat(line.text).isEqualTo("salut")
        assertThat(line.isOriginal).isTrue()
        assertThat(line.languageCode).isNull()
    }

    @Test
    fun `Original with blank text yields no line`() {
        val line = CallCaptionResolver.resolve(segment(text = "   "), CaptionsMode.Original)
        assertThat(line).isNull()
    }

    // --- resolve: Translated -------------------------------------------------

    @Test
    fun `Translated shows the translation as native content tagged with its language`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "salut", translatedText = "hi", translatedLanguage = "en"),
            CaptionsMode.Translated,
        )!!
        assertThat(line.text).isEqualTo("hi")
        assertThat(line.isOriginal).isFalse()
        assertThat(line.languageCode).isEqualTo("en")
    }

    @Test
    fun `Translated falls back to the original words when no translation exists`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "salut", translatedText = null),
            CaptionsMode.Translated,
        )!!
        assertThat(line.text).isEqualTo("salut")
        assertThat(line.isOriginal).isTrue()
        assertThat(line.languageCode).isNull()
    }

    @Test
    fun `Translated treats a blank translation as absent and shows the original`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "salut", translatedText = "   ", translatedLanguage = "en"),
            CaptionsMode.Translated,
        )!!
        assertThat(line.text).isEqualTo("salut")
        assertThat(line.isOriginal).isTrue()
        assertThat(line.languageCode).isNull()
    }

    @Test
    fun `Translated shows the translation even when the original words are blank`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "   ", translatedText = "hi", translatedLanguage = "en"),
            CaptionsMode.Translated,
        )!!
        assertThat(line.text).isEqualTo("hi")
        assertThat(line.isOriginal).isFalse()
    }

    @Test
    fun `Translated with an untagged translation shows it with no language code`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "salut", translatedText = "hi", translatedLanguage = null),
            CaptionsMode.Translated,
        )!!
        assertThat(line.text).isEqualTo("hi")
        assertThat(line.isOriginal).isFalse()
        assertThat(line.languageCode).isNull()
    }

    @Test
    fun `Translated with both texts blank yields no line`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "  ", translatedText = "  "),
            CaptionsMode.Translated,
        )
        assertThat(line).isNull()
    }

    // --- speaker identity carried through -----------------------------------

    @Test
    fun `the resolved line preserves the speaker identity`() {
        val line = CallCaptionResolver.resolve(
            segment(text = "hi", speakerId = "me", speakerName = "Grace", isLocal = true),
            CaptionsMode.Original,
        )!!
        assertThat(line.speakerId).isEqualTo("me")
        assertThat(line.speakerName).isEqualTo("Grace")
        assertThat(line.isLocal).isTrue()
    }

    // --- resolveAll ----------------------------------------------------------

    @Test
    fun `resolveAll on an empty list yields nothing`() {
        assertThat(CallCaptionResolver.resolveAll(emptyList(), CaptionsMode.Translated)).isEmpty()
    }

    @Test
    fun `resolveAll in Off mode yields nothing for any segments`() {
        val segments = listOf(segment(text = "a"), segment(text = "b"))
        assertThat(CallCaptionResolver.resolveAll(segments, CaptionsMode.Off)).isEmpty()
    }

    @Test
    fun `resolveAll drops blank segments and keeps the renderable ones in order`() {
        val segments = listOf(
            segment(text = "  ", speakerName = "blank"),
            segment(text = "first", speakerName = "A"),
            segment(text = "\n", speakerName = "blank2"),
            segment(text = "second", speakerName = "B"),
        )
        val lines = CallCaptionResolver.resolveAll(segments, CaptionsMode.Original)
        assertThat(lines.map { it.text }).containsExactly("first", "second").inOrder()
        assertThat(lines.map { it.speakerName }).containsExactly("A", "B").inOrder()
    }
}
