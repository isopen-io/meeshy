package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13333 — the live journal of a call, iOS `CallTranscriptionService` + `CallTranscriptMergeRules` +
 * `CallTranscriptJournal`: one line per utterance whatever transport brings it, revisions replacing
 * in place, the translation enriching, sorted by capture clock.
 */
class CallLiveJournalTest {

    private fun seg(
        wireId: String? = "w1",
        text: String = "Hello",
        speakerId: String = "peer",
        isFinal: Boolean = false,
        at: Long = 1_000,
        language: String? = "en",
        translatedText: String? = null,
        translatedLanguage: String? = null,
        name: String? = null,
    ) = CallJournalSegment(
        wireId = wireId,
        speakerId = speakerId,
        speakerDisplayName = name,
        text = text,
        language = language,
        isFinal = isFinal,
        capturedAtMs = at,
        translatedText = translatedText,
        translatedLanguage = translatedLanguage,
    )

    @Test
    fun `the partial revisions of one utterance replace each other in place, and its final closes it`() {
        val journal = CallLiveJournal()
            .receive(seg(text = "How"))
            .receive(seg(text = "How are", at = 1_200))
            .receive(seg(text = "How are you?", isFinal = true, at = 1_400))

        assertThat(journal.segments.map { it.text }).containsExactly("How are you?")
        assertThat(journal.segments.single().isFinal).isTrue()
        assertThat(journal.segments.single().capturedAtMs).isEqualTo(1_000)
    }

    @Test
    fun `the translated relay enriches the line the data channel already drew, never duplicates it`() {
        val journal = CallLiveJournal()
            .receive(seg(text = "How are you?", isFinal = true))
            .receive(seg(text = "How are you ?", isFinal = true, translatedText = "Comment vas-tu ?", translatedLanguage = "fr", name = "Ada"))

        val line = journal.segments.single()
        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.translatedText).isEqualTo("Comment vas-tu ?")
        assertThat(line.translatedLanguage).isEqualTo("fr")
        assertThat(line.speakerDisplayName).isEqualTo("Ada")
    }

    @Test
    fun `a late partial after the final is a stale revision and changes nothing`() {
        val journal = CallLiveJournal()
            .receive(seg(text = "Done.", isFinal = true))
            .receive(seg(text = "Do", isFinal = false))

        assertThat(journal.segments.single().text).isEqualTo("Done.")
        assertThat(journal.segments.single().isFinal).isTrue()
    }

    @Test
    fun `a new utterance drops the same speaker's unfinished line, never another speaker's`() {
        val journal = CallLiveJournal()
            .receive(seg(wireId = "a", text = "Unfinished", at = 1))
            .receive(seg(wireId = "b", speakerId = "other", text = "Mine too", at = 2))
            .receive(seg(wireId = "c", text = "Next", at = 3))

        assertThat(journal.segments.map { it.text }).containsExactly("Mine too", "Next").inOrder()
    }

    @Test
    fun `lines are ordered by capture clock, whatever the arrival order`() {
        val journal = CallLiveJournal()
            .receive(seg(wireId = "late", text = "second", isFinal = true, at = 20))
            .receive(seg(wireId = "early", speakerId = "other", text = "first", isFinal = true, at = 10))

        assertThat(journal.segments.map { it.text }).containsExactly("first", "second").inOrder()
    }

    @Test
    fun `a legacy relay without merge key appends a final line of its own`() {
        val journal = CallLiveJournal()
            .receive(seg(wireId = null, text = "one", isFinal = true, at = 1))
            .receive(seg(wireId = null, text = "two", isFinal = true, at = 2))

        assertThat(journal.segments.map { it.text }).containsExactly("one", "two").inOrder()
    }

    @Test
    fun `every line keeps a stable key across its merges, and keys are never reused`() {
        val first = CallLiveJournal().receive(seg(wireId = "a", text = "A", at = 1))
        val key = first.segments.single().key
        val merged = first.receive(seg(wireId = "a", text = "A!", isFinal = true, at = 2))
        val more = merged.receive(seg(wireId = "b", text = "B", isFinal = true, at = 3))

        assertThat(merged.segments.single().key).isEqualTo(key)
        assertThat(more.segments.map { it.key }.toSet()).hasSize(2)
    }

    @Test
    fun `the journal keeps the most recent lines once past its ceiling`() {
        val journal = (1..CallLiveJournal.CEILING + 3).fold(CallLiveJournal()) { acc, i ->
            acc.receive(seg(wireId = "w$i", text = "t$i", isFinal = true, at = i.toLong()))
        }

        assertThat(journal.segments).hasSize(CallLiveJournal.CEILING)
        assertThat(journal.segments.first().text).isEqualTo("t4")
        assertThat(journal.tail(2).map { it.text }).containsExactly("t${CallLiveJournal.CEILING + 2}", "t${CallLiveJournal.CEILING + 3}").inOrder()
    }

    @Test
    fun `a relay segment reads its translation, its source language and the speaker's capture clock`() {
        val segment = CallJournalSegment.fromRelay(
            CallTranslatedSegmentRef(
                id = "w9", text = "Hello", translatedText = "Bonjour", speakerId = "u",
                isFinal = true, sourceLanguage = "en", targetLanguage = "fr", capturedAtMs = 77,
            ),
            receivedAtMs = 999,
        )!!

        assertThat(segment.wireId).isEqualTo("w9")
        assertThat(segment.language).isEqualTo("en")
        assertThat(segment.translatedLanguage).isEqualTo("fr")
        assertThat(segment.capturedAtMs).isEqualTo(77)
    }

    @Test
    fun `an untranslated relay carries no target language, and an old gateway is stamped at reception`() {
        val segment = CallJournalSegment.fromRelay(
            CallTranslatedSegmentRef(text = "Salut", speakerId = "u", sourceLanguage = "fr", targetLanguage = "fr"),
            receivedAtMs = 999,
        )!!

        assertThat(segment.translatedLanguage).isNull()
        assertThat(segment.capturedAtMs).isEqualTo(999)
    }

    @Test
    fun `a relay without speaker or words is dropped`() {
        assertThat(CallJournalSegment.fromRelay(CallTranslatedSegmentRef(text = "x"), 1)).isNull()
        assertThat(CallJournalSegment.fromRelay(CallTranslatedSegmentRef(text = " ", speakerId = "u"), 1)).isNull()
    }

    @Test
    fun `the journal follows the live edge until the reader scrolls up, then counts what arrives unseen`() {
        val left = CallJournalFollow.LIVE.scrolled(atLiveEdge = false, movedUp = true)

        assertThat(CallJournalFollow.LIVE.lineArrived()).isEqualTo(CallJournalFollow.LIVE)
        assertThat(left.showsReturnToLive).isTrue()
        assertThat(left.lineArrived().hasUnseen).isTrue()
        assertThat(left.lineArrived().scrolled(atLiveEdge = true, movedUp = false)).isEqualTo(CallJournalFollow.LIVE)
        assertThat(CallJournalFollow.LIVE.scrolled(atLiveEdge = false, movedUp = false)).isEqualTo(CallJournalFollow.LIVE)
    }
}
