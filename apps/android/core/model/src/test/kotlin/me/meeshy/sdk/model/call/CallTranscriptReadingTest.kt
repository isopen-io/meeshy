package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * A1.6 — le journal d'un appel se lit EN ENTIER, page après page (miroir de iOS `CallTranscriptPaging.Reading`) : on
 * continue tant que la passerelle annonce une suite et qu'une page apporte une phrase neuve, jamais au-delà de la borne,
 * et une phrase servie par deux pages ne se garde qu'une fois, rangée par heure de début.
 */
class CallTranscriptReadingTest {

    private fun segment(id: String, atMs: Long) =
        PersistedTranscriptSegment(id = id, speakerId = "u2", text = "t-$id", language = "fr", capturedAtMs = atMs)

    private fun capture(id: String) = PersistedTranscriptCapture(id = id, kind = "screenshot", offsetMs = 0L)

    private fun page(hasMore: Boolean, segments: List<PersistedTranscriptSegment> = emptyList(), captures: List<PersistedTranscriptCapture> = emptyList()) =
        CallTranscriptPage(
            callId = "call-1",
            conversationId = "conv-1",
            callStartedAt = "2026-10-29T10:00:00.000Z",
            total = 3,
            hasMore = hasMore,
            segments = segments,
            captures = captures,
        )

    @Test
    fun `a page that says nothing more is the whole call and asks for no other page`() {
        val reading = CallTranscriptReading.first(page(hasMore = false, segments = listOf(segment("a", 1))))

        assertThat(reading.continues).isFalse()
        assertThat(reading.transcript.hasMore).isFalse()
        assertThat(reading.transcript.segments.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a page that says more asks for the next one after what it served`() {
        val reading = CallTranscriptReading.first(page(hasMore = true, segments = listOf(segment("a", 1), segment("b", 2))))

        assertThat(reading.continues).isTrue()
        assertThat(reading.offset).isEqualTo(2)
    }

    @Test
    fun `pages are chained until the gateway stops announcing more, in order of start`() {
        val reading = CallTranscriptReading.first(page(hasMore = true, segments = listOf(segment("b", 20), segment("a", 10))))
            .absorbing(page(hasMore = false, segments = listOf(segment("c", 30))))

        assertThat(reading.continues).isFalse()
        assertThat(reading.transcript.segments.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(reading.transcript.hasMore).isFalse()
    }

    @Test
    fun `a sentence served by two pages is kept once, at its first place`() {
        val reading = CallTranscriptReading.first(page(hasMore = true, segments = listOf(segment("a", 1), segment("b", 2))))
            .absorbing(page(hasMore = false, segments = listOf(segment("b", 2), segment("c", 3))))

        assertThat(reading.transcript.segments.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(reading.offset).isEqualTo(4)
    }

    @Test
    fun `an empty page or one that repeats the previous never loops, and the call says it is incomplete`() {
        val first = CallTranscriptReading.first(page(hasMore = true, segments = listOf(segment("a", 1))))

        val empty = first.absorbing(page(hasMore = true))
        val repeated = first.absorbing(page(hasMore = true, segments = listOf(segment("a", 1))))

        assertThat(empty.continues).isFalse()
        assertThat(empty.transcript.hasMore).isTrue()
        assertThat(repeated.continues).isFalse()
        assertThat(repeated.transcript.hasMore).isTrue()
    }

    @Test
    fun `the page bound stops the reading and the call says it is incomplete`() {
        var reading = CallTranscriptReading.first(page(hasMore = true, segments = listOf(segment("s0", 0))))
        (1 until CallTranscriptPaging.MAX_PAGES).forEach { index ->
            assertThat(reading.continues).isTrue()
            reading = reading.absorbing(page(hasMore = true, segments = listOf(segment("s$index", index.toLong()))))
        }

        assertThat(reading.continues).isFalse()
        assertThat(reading.transcript.hasMore).isTrue()
    }

    @Test
    fun `the captures come from the first page, which the gateway repeats on every page`() {
        val reading = CallTranscriptReading.first(page(hasMore = true, captures = listOf(capture("k1")), segments = listOf(segment("a", 1))))
            .absorbing(page(hasMore = false, captures = listOf(capture("k1")), segments = listOf(segment("b", 2))))

        assertThat(reading.transcript.captures.map { it.id }).containsExactly("k1")
    }

    @Test
    fun `a page is asked 100 sentences at a time, the most the gateway serves`() {
        assertThat(CallTranscriptPaging.PAGE_SIZE).isEqualTo(100)
    }
}
