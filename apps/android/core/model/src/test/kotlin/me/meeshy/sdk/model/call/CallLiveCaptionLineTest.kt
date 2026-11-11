package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13333 — what a caption line SAYS (iOS `CallCaptionLine.make`), under the Prisme, plus the state
 * of the « Sous-titres » button and its fail-closed gate.
 */
class CallLiveCaptionLineTest {

    private val labels = CallCaptionLabels(me = "Me", unknown = "Unknown")
    private val reader = CallCaptionReader(userId = "me", name = "Jo", prism = listOf("fr", "en"))

    private fun seg(
        key: String = "j1",
        speakerId: String = "peer",
        text: String = "How are you?",
        language: String? = "en",
        translatedText: String? = "Comment vas-tu ?",
        translatedLanguage: String? = "fr",
        isFinal: Boolean = true,
        name: String? = "Ada (wire)",
    ) = CallJournalSegment(
        key = key, wireId = "w", speakerId = speakerId, speakerDisplayName = name, text = text,
        language = language, isFinal = isFinal, capturedAtMs = 1, translatedText = translatedText,
        translatedLanguage = translatedLanguage,
    )

    private fun line(segment: CallJournalSegment = seg(), prefersOriginal: Boolean = false, isRevealed: Boolean = false, peerName: String? = "Ada") =
        CallLiveCaptionLines.line(segment, reader, peerName, prefersOriginal, isRevealed, labels)

    private val frenchOnly = reader.copy(prism = listOf("fr"))

    private fun lineForFrench(segment: CallJournalSegment) =
        CallLiveCaptionLines.line(segment, frenchOnly, "Ada", prefersOriginal = false, isRevealed = false, labels = labels)

    @Test
    fun `a peer's words are read in the translation the reader's prism elects, tagged source to target`() {
        val line = line()

        assertThat(line.text).isEqualTo("Comment vas-tu ?")
        assertThat(line.languageTag).isEqualTo("EN → FR")
        assertThat(line.isShowingOriginal).isFalse()
        assertThat(line.canRevealOriginal).isTrue()
    }

    @Test
    fun `the original language competes at its rank — a rank-2 translation never beats words already in rank 1`() {
        val englishFirst = reader.copy(prism = listOf("en", "fr"))

        val line = CallLiveCaptionLines.line(seg(), englishFirst, "Ada", prefersOriginal = false, isRevealed = false, labels = labels)

        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.languageTag).isNull()
        assertThat(line.canRevealOriginal).isFalse()
    }

    @Test
    fun `a translation outside the prism is never served — the original is`() {
        val line = line(seg(translatedText = "¿Cómo estás?", translatedLanguage = "es"))

        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.canRevealOriginal).isFalse()
    }

    @Test
    fun `touching a translated line keeps the translation and unfolds the original below (#17340)`() {
        val line = line(isRevealed = true)

        assertThat(line.text).isEqualTo("Comment vas-tu ?")
        assertThat(line.originalBelow).isEqualTo("How are you?")
        assertThat(line.languageTag).isEqualTo("EN → FR")
        assertThat(line.isShowingOriginal).isFalse()
    }

    @Test
    fun `an untouched translated line unfolds nothing`() {
        assertThat(line().originalBelow).isNull()
    }

    @Test
    fun `on the Original preference the line shows the original, and a touch shows the translation without unfolding`() {
        val original = line(prefersOriginal = true)
        val touched = line(prefersOriginal = true, isRevealed = true)

        assertThat(original.text).isEqualTo("How are you?")
        assertThat(original.originalBelow).isNull()
        assertThat(touched.text).isEqualTo("Comment vas-tu ?")
        assertThat(touched.originalBelow).isNull()
    }

    @Test
    fun `an original is labelled with its own language when it lies outside the prism`() {
        val line = lineForFrench(seg(translatedText = null, translatedLanguage = null))

        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.languageTag).isEqualTo("EN")
        assertThat(line.originLanguage).isEqualTo("EN")
        assertThat(line.servedLanguage).isNull()
        assertThat(line.canRevealOriginal).isFalse()
    }

    @Test
    fun `a final remote original outside the prism awaits its translation until the deadline (#17495)`() {
        val line = lineForFrench(seg(translatedText = null, translatedLanguage = null))

        assertThat(line.isAwaitingTranslation).isTrue()
        assertThat(line.awaitingUntilMs).isEqualTo(1 + CallCaptionTranslationWait.TIMEOUT_MS)
    }

    @Test
    fun `a partial original is labelled but never awaits`() {
        val line = lineForFrench(seg(translatedText = null, translatedLanguage = null, isFinal = false))

        assertThat(line.languageTag).isEqualTo("EN")
        assertThat(line.isAwaitingTranslation).isFalse()
    }

    @Test
    fun `an original already in the prism, at any rank, has no label and no wait`() {
        val first = line(seg(translatedText = null, translatedLanguage = null, language = "FR"))
        val secondary = line(seg(translatedText = null, translatedLanguage = null))

        assertThat(first.languageTag).isNull()
        assertThat(first.isAwaitingTranslation).isFalse()
        assertThat(secondary.languageTag).isNull()
        assertThat(secondary.isAwaitingTranslation).isFalse()
    }

    @Test
    fun `a regional variant of a prism language is already in the prism — no label, no wait (Prisme rule 4)`() {
        val regional = line(seg(translatedText = null, translatedLanguage = null, language = "en-US"))
        val underscored = lineForFrench(seg(translatedText = null, translatedLanguage = null, language = "fr_CA"))

        assertThat(regional.languageTag).isNull()
        assertThat(regional.isAwaitingTranslation).isFalse()
        assertThat(underscored.languageTag).isNull()
        assertThat(underscored.isAwaitingTranslation).isFalse()
    }

    @Test
    fun `without a prism nothing is awaited, but the original is labelled`() {
        val line = CallLiveCaptionLines.line(
            seg(translatedText = null, translatedLanguage = null), reader.copy(prism = emptyList()), "Ada", false, false, labels,
        )

        assertThat(line.languageTag).isEqualTo("EN")
        assertThat(line.isAwaitingTranslation).isFalse()
    }

    @Test
    fun `a translated line shown as original on the Original preference keeps the origin label`() {
        val line = CallLiveCaptionLines.line(seg(), frenchOnly, "Ada", prefersOriginal = true, isRevealed = false, labels = labels)

        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.languageTag).isEqualTo("EN")
        assertThat(line.servedLanguage).isNull()
        assertThat(line.canRevealOriginal).isTrue()
    }

    @Test
    fun `my own words are never labelled nor awaited`() {
        val line = lineForFrench(seg(speakerId = "me", translatedText = null, translatedLanguage = null))

        assertThat(line.languageTag).isNull()
        assertThat(line.isAwaitingTranslation).isFalse()
    }

    @Test
    fun `when the translation arrives the wait ends and the pair replaces the label`() {
        val line = line()

        assertThat(line.isAwaitingTranslation).isFalse()
        assertThat(line.languageTag).isEqualTo("EN → FR")
        assertThat(line.originLanguage).isEqualTo("EN")
        assertThat(line.servedLanguage).isEqualTo("FR")
    }

    @Test
    fun `the wait falls at its deadline and the origin label stays`() {
        val awaiting = lineForFrench(seg(translatedText = null, translatedLanguage = null))
        val deadline = checkNotNull(awaiting.awaitingUntilMs)

        assertThat(awaiting.settled(nowMs = deadline - 1).isAwaitingTranslation).isTrue()
        val given = awaiting.settled(nowMs = deadline)
        assertThat(given.isAwaitingTranslation).isFalse()
        assertThat(given.languageTag).isEqualTo("EN")
        assertThat(given.text).isEqualTo("How are you?")
    }

    @Test
    fun `the screen redraws only at the next deadline still to come`() {
        val first = lineForFrench(seg(key = "a", translatedText = null, translatedLanguage = null))
        val second = lineForFrench(seg(key = "b", translatedText = null, translatedLanguage = null).copy(capturedAtMs = 4_000))
        val done = line()

        assertThat(CallLiveCaptionLines.nextDeadline(listOf(first, second, done), nowMs = 0)).isEqualTo(8_001)
        assertThat(CallLiveCaptionLines.nextDeadline(listOf(first, second, done), nowMs = 8_001)).isEqualTo(12_000)
        assertThat(CallLiveCaptionLines.nextDeadline(listOf(first, second, done), nowMs = 12_000)).isNull()
        assertThat(CallLiveCaptionLines.nextDeadline(emptyList(), nowMs = 0)).isNull()
    }

    @Test
    fun `an empty translation is treated as absent`() {
        val line = lineForFrench(seg(translatedText = "  "))

        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.languageTag).isEqualTo("EN")
        assertThat(line.isAwaitingTranslation).isTrue()
    }

    @Test
    fun `my own words are never translated for me and are signed « Me », not with my name (#17495)`() {
        val line = line(seg(speakerId = "me"))

        assertThat(line.isLocal).isTrue()
        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.speakerName).isEqualTo("Me")
        assertThat(line.announcement).isNull()
    }

    @Test
    fun `the peer's name comes from the call first, the wire second, then « Unknown »`() {
        assertThat(line(peerName = "Ada").speakerName).isEqualTo("Ada")
        assertThat(line(peerName = null).speakerName).isEqualTo("Ada (wire)")
        assertThat(line(seg(name = null), peerName = " ").speakerName).isEqualTo("Unknown")
    }

    @Test
    fun `only a peer's FINAL sentence is announced`() {
        val lines = CallLiveCaptionLines.lines(
            listOf(seg(key = "a", text = "One.", translatedText = null), seg(key = "b", text = "Tw", translatedText = null, isFinal = false)),
            reader, "Ada", prefersOriginal = false, revealed = emptySet(), labels = labels,
        )

        assertThat(CallLiveCaptionLines.latestAnnouncement(lines)?.announcement).isEqualTo("Ada : One.")
    }

    @Test
    fun `the button cycles off, translated, original, off — forgetting the flips, never the journal`() {
        val journal = CallLiveJournal().receive(seg())
        val open = CallCaptionsState(gate = CallCaptionsGate.Open, journal = journal)

        val translated = open.advanced()
        val original = translated.togglingReveal("j1").advanced()
        val off = original.advanced()

        assertThat(translated.mode).isEqualTo(CaptionsMode.Translated)
        assertThat(original.mode).isEqualTo(CaptionsMode.Original)
        assertThat(off.mode).isEqualTo(CaptionsMode.Off)
        assertThat(off.revealed).isEmpty()
        assertThat(off.journal).isEqualTo(journal)
        assertThat(off.advanced().mode).isEqualTo(CaptionsMode.Translated)
    }

    @Test
    fun `an end-to-end conversation never opens the captions, and a regime not read yet neither`() {
        assertThat(CallCaptionsState(gate = CallCaptionsGate.EndToEnd).advanced().isPanelOpen).isFalse()
        assertThat(CallCaptionsState(gate = CallCaptionsGate.Unresolved).advanced().isPanelOpen).isFalse()
        assertThat(CallCaptionsGate.of("conv", isEndToEnd = true)).isEqualTo(CallCaptionsGate.EndToEnd)
        assertThat(CallCaptionsGate.of("conv", isEndToEnd = null)).isEqualTo(CallCaptionsGate.Unresolved)
        assertThat(CallCaptionsGate.of("", isEndToEnd = false)).isEqualTo(CallCaptionsGate.Unresolved)
        assertThat(CallCaptionsGate.of("conv", isEndToEnd = false)).isEqualTo(CallCaptionsGate.Open)
    }

    @Test
    fun `a gate that closes takes an open panel down`() {
        val open = CallCaptionsState(gate = CallCaptionsGate.Open).advanced()

        assertThat(open.gated(CallCaptionsGate.EndToEnd).isPanelOpen).isFalse()
    }

    @Test
    fun `the journal keeps the whole call, my captions on or off, and only a closed gate drops it (#17342)`() {
        val segment = seg()

        assertThat(CallCaptionsState(gate = CallCaptionsGate.Open).receiving(segment).journal.isEmpty).isFalse()
        assertThat(CallCaptionsState(gate = CallCaptionsGate.Open).advanced().receiving(segment).journal.isEmpty).isFalse()
        assertThat(CallCaptionsState(gate = CallCaptionsGate.Open, isPanelOpen = true).gated(CallCaptionsGate.EndToEnd).receiving(segment).journal.isEmpty).isTrue()
        assertThat(CallCaptionsState().receiving(segment).journal.isEmpty).isTrue()
    }

    @Test
    fun `what was gathered while my captions were off is still in the journal once I turn them on`() {
        val gathered = CallCaptionsState(gate = CallCaptionsGate.Open).receiving(seg())

        assertThat(gathered.advanced().journal.segments).hasSize(1)
        assertThat(gathered.advanced().advanced().advanced().journal.segments).hasSize(1)
    }

    @Test
    fun `a listening peer invites me while my captions are off, my own devices and leavers do not count`() {
        val listeners = CallCaptionListeners()
            .applying("peer", active = true, selfId = "me")
            .applying("me", active = true, selfId = "me")

        assertThat(listeners.peers).containsExactly("peer")
        assertThat(CallCaptionsState(listeners = listeners).invitesToOpen).isTrue()
        assertThat(CallCaptionsState(gate = CallCaptionsGate.Open, listeners = listeners).advanced().invitesToOpen).isFalse()
        assertThat(listeners.leaving("peer").isAnyPeerListening).isFalse()
        assertThat(listeners.applying("peer", active = false, selfId = "me").isAnyPeerListening).isFalse()
    }
}
