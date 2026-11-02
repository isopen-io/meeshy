package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13333 — what a caption line SAYS (iOS `CallCaptionLine.make`), under the Prisme, plus the state
 * of the « Sous-titres » button and its fail-closed gate.
 */
class CallLiveCaptionLineTest {

    private val labels = CallCaptionLabels(you = "You", unknown = "Unknown")
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
    fun `touching a translated line shows its original, and the Original preference flips that`() {
        assertThat(line(isRevealed = true).text).isEqualTo("How are you?")
        assertThat(line(prefersOriginal = true).text).isEqualTo("How are you?")
        assertThat(line(prefersOriginal = true, isRevealed = true).text).isEqualTo("Comment vas-tu ?")
    }

    @Test
    fun `my own words are never translated for me and carry my name`() {
        val line = line(seg(speakerId = "me"))

        assertThat(line.isLocal).isTrue()
        assertThat(line.text).isEqualTo("How are you?")
        assertThat(line.speakerName).isEqualTo("Jo")
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
    fun `reception is tied to the open panel and the open gate`() {
        val segment = seg()

        assertThat(CallCaptionsState(gate = CallCaptionsGate.Open).receiving(segment).journal.isEmpty).isTrue()
        assertThat(CallCaptionsState(gate = CallCaptionsGate.Open).advanced().receiving(segment).journal.isEmpty).isFalse()
        assertThat(CallCaptionsState(gate = CallCaptionsGate.Open, isPanelOpen = true).gated(CallCaptionsGate.EndToEnd).receiving(segment).journal.isEmpty).isTrue()
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
