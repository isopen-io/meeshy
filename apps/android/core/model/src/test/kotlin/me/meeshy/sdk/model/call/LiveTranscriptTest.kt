package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the rolling live-call transcript accumulator
 * ([LiveTranscript] + [CallTranscriptSegment]).
 *
 * The buffer is the pure SSOT the captions overlay renders. It folds incoming
 * transcript segments exactly like iOS `CallTranscriptionService.appendSegment`
 * (`apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift`):
 *
 *  - a new segment from a speaker first drops that speaker's *in-progress*
 *    (non-final) line, so at most one interim line per speaker is ever live;
 *  - finalized lines are never dropped by that rule;
 *  - the buffer is bounded to a retention limit by *insertion* order;
 *  - the on-screen order is by wall-clock capture time, not ASR-relative start.
 *
 * Every assertion is on observable behaviour through the public API (the retained
 * set, its display order, the projected caption lines) — never internal shape.
 */
class LiveTranscriptTest {

    private fun seg(
        id: String,
        speakerId: String = "u1",
        speakerName: String = "Ada",
        isLocal: Boolean = true,
        text: String = "hello",
        isFinal: Boolean = true,
        capturedAtMs: Long = 0L,
        translatedText: String? = null,
        translatedLanguage: String? = null,
    ) = CallTranscriptSegment(
        id = id,
        speakerId = speakerId,
        speakerName = speakerName,
        isLocal = isLocal,
        text = text,
        isFinal = isFinal,
        capturedAtMs = capturedAtMs,
        translatedText = translatedText,
        translatedLanguage = translatedLanguage,
    )

    // --- accumulation ---------------------------------------------------------

    @Test
    fun `appending to an empty transcript yields that single segment`() {
        val t = LiveTranscript().append(seg("a"))
        assertThat(t.segments.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a second interim line from the same speaker replaces the first`() {
        val t = LiveTranscript()
            .append(seg("a", isFinal = false, text = "hel"))
            .append(seg("b", isFinal = false, text = "hello"))
        assertThat(t.segments.map { it.id }).containsExactly("b")
        assertThat(t.segments.single().text).isEqualTo("hello")
    }

    @Test
    fun `interim lines from different speakers coexist`() {
        val t = LiveTranscript()
            .append(seg("a", speakerId = "u1", isFinal = false))
            .append(seg("b", speakerId = "u2", isFinal = false))
        assertThat(t.segments.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `a final line is kept when a later interim line from the same speaker arrives`() {
        val t = LiveTranscript()
            .append(seg("a", isFinal = true, capturedAtMs = 1))
            .append(seg("b", isFinal = false, capturedAtMs = 2))
        assertThat(t.ordered.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `an interim line is replaced when the finalized line for the same speaker arrives`() {
        val t = LiveTranscript()
            .append(seg("a", isFinal = false, text = "hel"))
            .append(seg("b", isFinal = true, text = "hello"))
        assertThat(t.segments.map { it.id }).containsExactly("b")
    }

    @Test
    fun `two final lines from the same speaker are both retained`() {
        val t = LiveTranscript()
            .append(seg("a", isFinal = true, capturedAtMs = 1))
            .append(seg("b", isFinal = true, capturedAtMs = 2))
        assertThat(t.ordered.map { it.id }).containsExactly("a", "b").inOrder()
    }

    // --- ordering -------------------------------------------------------------

    @Test
    fun `ordered sorts by wall-clock capture time regardless of append order`() {
        val t = LiveTranscript()
            .append(seg("late", capturedAtMs = 30))
            .append(seg("early", capturedAtMs = 10))
            .append(seg("mid", capturedAtMs = 20))
        assertThat(t.ordered.map { it.id }).containsExactly("early", "mid", "late").inOrder()
    }

    @Test
    fun `equal capture times keep insertion order (stable)`() {
        val t = LiveTranscript()
            .append(seg("first", speakerId = "u1", capturedAtMs = 5))
            .append(seg("second", speakerId = "u2", capturedAtMs = 5))
        assertThat(t.ordered.map { it.id }).containsExactly("first", "second").inOrder()
    }

    // --- retention ------------------------------------------------------------

    @Test
    fun `the buffer is bounded to the retention limit by insertion order`() {
        val t = LiveTranscript()
            .append(seg("a", speakerId = "u1", capturedAtMs = 1), retentionLimit = 2)
            .append(seg("b", speakerId = "u2", capturedAtMs = 2), retentionLimit = 2)
            .append(seg("c", speakerId = "u3", capturedAtMs = 3), retentionLimit = 2)
        assertThat(t.segments.map { it.id }).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `retention drops the earliest-appended even when it has the latest capture time`() {
        // 'a' is appended first but stamped latest — insertion-order cap must
        // still evict it, proving the cap is not a keep-latest-by-time trim.
        val t = LiveTranscript()
            .append(seg("a", speakerId = "u1", capturedAtMs = 99), retentionLimit = 2)
            .append(seg("b", speakerId = "u2", capturedAtMs = 2), retentionLimit = 2)
            .append(seg("c", speakerId = "u3", capturedAtMs = 3), retentionLimit = 2)
        assertThat(t.segments.map { it.id }).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `the default retention limit is the iOS parity value`() {
        assertThat(LiveTranscript.DEFAULT_RETENTION_LIMIT).isEqualTo(50)
    }

    // --- caption projection (reuses CallCaptionResolver SSOT) ------------------

    @Test
    fun `caption lines are empty while captions are off`() {
        val t = LiveTranscript().append(seg("a", text = "hello"))
        assertThat(t.captionLines(CaptionsMode.Off)).isEmpty()
    }

    @Test
    fun `translated mode shows the translation when one exists`() {
        val t = LiveTranscript().append(
            seg("a", text = "bonjour", translatedText = "hello", translatedLanguage = "en"),
        )
        val line = t.captionLines(CaptionsMode.Translated).single()
        assertThat(line.text).isEqualTo("hello")
        assertThat(line.isOriginal).isFalse()
        assertThat(line.languageCode).isEqualTo("en")
    }

    @Test
    fun `translated mode falls back to the original when no translation exists`() {
        val t = LiveTranscript().append(seg("a", text = "bonjour", translatedText = null))
        val line = t.captionLines(CaptionsMode.Translated).single()
        assertThat(line.text).isEqualTo("bonjour")
        assertThat(line.isOriginal).isTrue()
    }

    @Test
    fun `original mode always shows the speaker's own words`() {
        val t = LiveTranscript().append(
            seg("a", text = "bonjour", translatedText = "hello", translatedLanguage = "en"),
        )
        val line = t.captionLines(CaptionsMode.Original).single()
        assertThat(line.text).isEqualTo("bonjour")
        assertThat(line.isOriginal).isTrue()
    }

    @Test
    fun `a blank-text segment is retained but yields no caption line`() {
        val t = LiveTranscript().append(seg("a", text = "   "))
        assertThat(t.segments.map { it.id }).containsExactly("a")
        assertThat(t.captionLines(CaptionsMode.Original)).isEmpty()
    }

    @Test
    fun `caption lines follow the ordered (capture-time) sequence`() {
        val t = LiveTranscript()
            .append(seg("late", text = "world", capturedAtMs = 30))
            .append(seg("early", text = "hello", capturedAtMs = 10))
        assertThat(t.captionLines(CaptionsMode.Original).map { it.text })
            .containsExactly("hello", "world").inOrder()
    }

    // --- purity ---------------------------------------------------------------

    @Test
    fun `append returns a new transcript and leaves the original unchanged`() {
        val base = LiveTranscript().append(seg("a"))
        val next = base.append(seg("b", speakerId = "u2"))
        assertThat(base.segments.map { it.id }).containsExactly("a")
        assertThat(next.segments.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `toCaptionSegment carries the Prisme fields across`() {
        val caption = seg(
            "a",
            speakerId = "u9",
            speakerName = "Bo",
            isLocal = false,
            text = "hola",
            translatedText = "hi",
            translatedLanguage = "en",
        ).toCaptionSegment()
        assertThat(caption).isEqualTo(
            CallCaptionSegment(
                speakerId = "u9",
                speakerName = "Bo",
                isLocal = false,
                text = "hola",
                translatedText = "hi",
                translatedLanguage = "en",
            ),
        )
    }
}
