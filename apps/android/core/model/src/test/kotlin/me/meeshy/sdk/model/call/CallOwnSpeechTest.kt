package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

/**
 * #13718 — my own words, captioned on the device and sent to my peers like iOS
 * (`TranscriptionCapturePolicy`, `CallTranscriptionService.applyRecognitionResult`,
 * `emitPartialEntry`, `emitFinalSegment`, `CallManager.preferredCallLanguage`).
 */
class CallOwnSpeechTest {
    private val voice = OwnSpeechVoice(callId = "call-1", speakerId = "me", speakerDisplayName = "Moi", language = "fr")
    private var minted = 0
    private val mint: () -> String = { "u${++minted}" }

    private fun action(
        panel: Boolean = false,
        peer: Boolean = false,
        capturing: Boolean = false,
        muted: Boolean = false,
        gate: CallCaptionsGate = CallCaptionsGate.Open,
        support: OwnSpeechSupport = OwnSpeechSupport.Available,
    ) = OwnSpeechCapturePolicy.action(panel, peer, capturing, muted, gate, support)

    @Test
    fun `capture starts as soon as someone listens, my panel or a peer`() {
        assertThat(action(panel = true)).isEqualTo(OwnSpeechCaptureAction.Start)
        assertThat(action(peer = true)).isEqualTo(OwnSpeechCaptureAction.Start)
        assertThat(action()).isEqualTo(OwnSpeechCaptureAction.None)
        assertThat(action(panel = true, capturing = true)).isEqualTo(OwnSpeechCaptureAction.None)
    }

    @Test
    fun `nobody listening, a muted microphone, a closed gate or a device that cannot stop the capture`() {
        assertThat(action(capturing = true)).isEqualTo(OwnSpeechCaptureAction.Stop)
        assertThat(action(panel = true, capturing = true, muted = true)).isEqualTo(OwnSpeechCaptureAction.Stop)
        assertThat(action(peer = true, capturing = true, gate = CallCaptionsGate.EndToEnd)).isEqualTo(OwnSpeechCaptureAction.Stop)
        assertThat(action(peer = true, capturing = true, gate = CallCaptionsGate.Unresolved)).isEqualTo(OwnSpeechCaptureAction.Stop)
        assertThat(action(panel = true, capturing = true, support = OwnSpeechSupport.LanguageMissing)).isEqualTo(OwnSpeechCaptureAction.Stop)
    }

    @Test
    fun `an end-to-end call, an unread regime or an unknown support never start the capture`() {
        assertThat(action(panel = true, peer = true, gate = CallCaptionsGate.EndToEnd)).isEqualTo(OwnSpeechCaptureAction.None)
        assertThat(action(panel = true, peer = true, gate = CallCaptionsGate.Unresolved)).isEqualTo(OwnSpeechCaptureAction.None)
        assertThat(action(panel = true, support = OwnSpeechSupport.Unknown)).isEqualTo(OwnSpeechCaptureAction.None)
        assertThat(action(panel = true, support = OwnSpeechSupport.DeviceUnsupported)).isEqualTo(OwnSpeechCaptureAction.None)
    }

    @Test
    fun `the spoken language is the in-app language first, like iOS preferredCallLanguage`() {
        val prefs = object : LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage: String? = null
            override val regionalLanguage: String? = "es"
            override val customDestinationLanguage: String? = "de"
        }
        assertThat(OwnSpeechLanguage.spoken(prefs, deviceLanguage = "en")).isEqualTo("es")
        assertThat(OwnSpeechLanguage.spoken(null, deviceLanguage = "pt")).isEqualTo("pt")
        assertThat(OwnSpeechLanguage.spoken(null, deviceLanguage = "")).isEqualTo("fr")
    }

    @Test
    fun `support is read from the installed recognition models, the device region choosing the variant`() {
        assertThat(OwnSpeechLanguage.readiness(sdkInt = 32, installed = setOf("fr-FR"), requested = "fr", region = "FR"))
            .isEqualTo(OwnSpeechReadiness(OwnSpeechSupport.DeviceUnsupported, null))
        assertThat(OwnSpeechLanguage.readiness(sdkInt = 34, installed = emptySet(), requested = "fr", region = "FR"))
            .isEqualTo(OwnSpeechReadiness(OwnSpeechSupport.DeviceUnsupported, null))
        assertThat(OwnSpeechLanguage.readiness(sdkInt = 34, installed = setOf("en-US"), requested = "fr", region = "FR"))
            .isEqualTo(OwnSpeechReadiness(OwnSpeechSupport.LanguageMissing, null))
        assertThat(OwnSpeechLanguage.readiness(sdkInt = 34, installed = setOf("fr-CA", "fr-FR"), requested = "fr", region = "FR"))
            .isEqualTo(OwnSpeechReadiness(OwnSpeechSupport.Available, "fr-FR"))
    }

    @Test
    fun `the partials of one utterance share its id and travel only on the data channel`() {
        val (afterFirst, first) = OwnSpeechStream(voice).partial("Bon", nowMs = 1_000, mint = mint)
        val (_, second) = afterFirst.partial("Bonjour", nowMs = 1_300, mint = mint)

        assertThat(first!!.entry).isEqualTo(CallTranscriptEntry("u1", "call-1", "me", "Moi", "Bon", "fr", 1_000, isFinal = false, confidence = 0.0))
        assertThat(first.relay).isNull()
        assertThat(second!!.entry.id).isEqualTo("u1")
        assertThat(second.entry.text).isEqualTo("Bonjour")
        assertThat(second.entry.capturedAtMs).isEqualTo(1_000)
        assertThat(second.relay).isNull()
    }

    @Test
    fun `the final closes the utterance on both transports, then the next one gets a new id`() {
        val speaking = OwnSpeechStream(voice).partial("Bon", nowMs = 1_000, mint = mint).first
        val (closed, final) = speaking.final("Bonjour à tous", confidence = 0.8, nowMs = 2_500, mint = mint)
        val (_, next) = closed.partial("Et", nowMs = 4_000, mint = mint)

        assertThat(final!!.entry).isEqualTo(CallTranscriptEntry("u1", "call-1", "me", "Moi", "Bonjour à tous", "fr", 1_000, isFinal = true, confidence = 0.8))
        assertThat(final.relay).isEqualTo(
            CallTranscriptionSegmentWire(
                id = "u1", text = "Bonjour à tous", speakerId = "me", startMs = 0, endMs = 1_500,
                isFinal = true, confidence = 0.8, language = "fr", capturedAtMs = 1_000,
            ),
        )
        assertThat(next!!.entry.id).isEqualTo("u2")
    }

    @Test
    fun `the gateway segment carries exactly the fields iOS emits`() {
        val wire = CallTranscriptionSegmentWire("u1", "Salut", "me", 0, 900, true, 0.5, "fr", 1_000)

        assertThat(wire.fields()).containsExactly(
            "id", "u1", "text", "Salut", "speakerId", "me", "startMs", 0L, "endMs", 900L,
            "isFinal", true, "confidence", 0.5, "language", "fr", "capturedAtMs", 1_000L,
        )
    }

    @Test
    fun `blank and repeated partials say nothing, and partials closer than the throughput floor are held back`() {
        val started = OwnSpeechStream(voice).partial("Bon", nowMs = 1_000, mint = mint).first

        assertThat(OwnSpeechStream(voice).partial("  ", nowMs = 1_000, mint = mint).second).isNull()
        assertThat(started.partial("Bon", nowMs = 1_500, mint = mint).second).isNull()
        assertThat(started.partial("Bonj", nowMs = 1_000 + OwnSpeechStream.PARTIAL_MIN_INTERVAL_MS - 1, mint = mint).second).isNull()
        assertThat(started.partial("Bonj", nowMs = 1_000 + OwnSpeechStream.PARTIAL_MIN_INTERVAL_MS, mint = mint).second).isNotNull()
    }

    @Test
    fun `an utterance that ends without words closes what the peer already saw, or says nothing`() {
        val (silentEnd, nothing) = OwnSpeechStream(voice).final("", confidence = 0.0, nowMs = 2_000, mint = mint)
        val speaking = OwnSpeechStream(voice).partial("Bon", nowMs = 1_000, mint = mint).first
            .partial("Bonjour", nowMs = 1_100, mint = mint).first
        val (_, closing) = speaking.final(" ", confidence = 0.0, nowMs = 2_000, mint = mint)

        assertThat(nothing).isNull()
        assertThat(silentEnd).isEqualTo(OwnSpeechStream(voice))
        assertThat(closing!!.entry.id).isEqualTo("u1")
        assertThat(closing.entry.text).isEqualTo("Bon")
        assertThat(closing.entry.isFinal).isTrue()
        assertThat(closing.relay!!.text).isEqualTo("Bon")
    }

    @Test
    fun `my line enters my own journal under my id, never translated`() {
        val (_, emission) = OwnSpeechStream(voice).final("Salut", confidence = 0.9, nowMs = 1_000, mint = mint)

        assertThat(emission!!.journal).isEqualTo(
            CallJournalSegment(
                wireId = "u1", speakerId = "me", speakerDisplayName = "Moi", text = "Salut",
                language = "fr", isFinal = true, capturedAtMs = 1_000,
            ),
        )
    }

    @Test
    fun `my finals enter my journal even while my panel is closed, my partials only while I read, nothing behind a closed gate`() {
        val partial = CallJournalSegment(wireId = "u1", speakerId = "me", speakerDisplayName = null, text = "Bon", language = "fr", isFinal = false, capturedAtMs = 1)
        val final = partial.copy(text = "Bonjour", isFinal = true)
        val closedPanel = CallCaptionsState(gate = CallCaptionsGate.Open)

        assertThat(closedPanel.receivingOwn(partial).journal.isEmpty).isTrue()
        assertThat(closedPanel.receivingOwn(final).journal.segments.single().text).isEqualTo("Bonjour")
        assertThat(closedPanel.copy(isPanelOpen = true).receivingOwn(partial).journal.segments.single().text).isEqualTo("Bon")
        assertThat(CallCaptionsState(gate = CallCaptionsGate.EndToEnd).receivingOwn(final).journal.isEmpty).isTrue()
    }

    @Test
    fun `only a device or a language that cannot caption says so`() {
        assertThat(OwnSpeechSupport.DeviceUnsupported.saysNotCaptioned).isTrue()
        assertThat(OwnSpeechSupport.LanguageMissing.saysNotCaptioned).isTrue()
        assertThat(OwnSpeechSupport.Available.saysNotCaptioned).isFalse()
        assertThat(OwnSpeechSupport.Unknown.saysNotCaptioned).isFalse()
    }
}
