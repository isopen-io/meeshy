package me.meeshy.sdk.model.call

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.speech.OnDeviceLanguageMatch

/** What the call layer does with the capture of my own words — iOS `TranscriptionCaptureAction`. */
enum class OwnSpeechCaptureAction { Start, Stop, None }

/**
 * Whether this device can caption MY words during a call (#13718). Android reads its microphone
 * through WebRTC and hands the samples to the on-device recognizer, which only takes an audio
 * source from Android 13 on, and only in a language whose model is installed.
 */
enum class OwnSpeechSupport {
    /** Not read yet: nothing is captured, nothing is said. */
    Unknown,
    Available,

    /** Before Android 13, or no on-device recognizer at all. */
    DeviceUnsupported,

    /** The recognizer is there, but not the model of my spoken language. */
    LanguageMissing,
    ;

    /** The button and the journal tell the user his words are not captioned here. */
    val saysNotCaptioned: Boolean get() = this == DeviceUnsupported || this == LanguageMissing
}

/**
 * iOS `TranscriptionCapturePolicy` with the #13720 gate: a device transcribes ONLY its own
 * microphone, so it captures as soon as someone listens — my panel or a peer who announced
 * `call:transcription-active` — and never while muted (#8475). An end-to-end conversation, a regime
 * not read yet, or a device that cannot caption never capture (fail-closed).
 */
object OwnSpeechCapturePolicy {
    fun action(
        localPanelOpen: Boolean,
        peerListening: Boolean,
        isCapturing: Boolean,
        isMicrophoneMuted: Boolean,
        gate: CallCaptionsGate,
        support: OwnSpeechSupport,
    ): OwnSpeechCaptureAction {
        val someoneListens = (localPanelOpen || peerListening) &&
            !isMicrophoneMuted &&
            gate.allowsCaptions &&
            support == OwnSpeechSupport.Available
        return when {
            someoneListens && !isCapturing -> OwnSpeechCaptureAction.Start
            !someoneListens && isCapturing -> OwnSpeechCaptureAction.Stop
            else -> OwnSpeechCaptureAction.None
        }
    }
}

/** The support of this device, and the recognizer tag to ask for when it is [OwnSpeechSupport.Available]. */
data class OwnSpeechReadiness(val support: OwnSpeechSupport, val tag: String?)

object OwnSpeechLanguage {
    /** The recognizer takes an audio source from Android 13 (API 33). */
    const val MIN_SDK_AUDIO_SOURCE: Int = 33

    /** iOS `CallManager.preferredCallLanguage`: the in-app languages first, then the device, then « fr ». */
    fun spoken(prefs: LanguageResolver.ContentLanguagePreferences?, deviceLanguage: String?): String =
        prefs?.let(LanguageResolver::resolveUserLanguage)
            ?: deviceLanguage?.takeIf { it.isNotBlank() }
            ?: LanguageResolver.FALLBACK_LANGUAGE

    fun readiness(sdkInt: Int, installed: Set<String>, requested: String, region: String?): OwnSpeechReadiness {
        if (sdkInt < MIN_SDK_AUDIO_SOURCE || installed.isEmpty()) return OwnSpeechReadiness(OwnSpeechSupport.DeviceUnsupported, null)
        val tag = OnDeviceLanguageMatch.resolve(requested, installed, region)
            ?: return OwnSpeechReadiness(OwnSpeechSupport.LanguageMissing, null)
        return OwnSpeechReadiness(OwnSpeechSupport.Available, tag)
    }
}

/** Who speaks, in which call and which language: stamped on every entry, like iOS. */
data class OwnSpeechVoice(
    val callId: String,
    val speakerId: String,
    val speakerDisplayName: String,
    val language: String,
)

/**
 * `call:transcription-segment`'s `segment` — iOS `CallTranscriptionSegmentPayload`, field for
 * field. Only finals go to the gateway: it relays them translated per listener and its rate limit
 * is sized for them.
 */
data class CallTranscriptionSegmentWire(
    val id: String,
    val text: String,
    val speakerId: String,
    val startMs: Long,
    val endMs: Long,
    val isFinal: Boolean,
    val confidence: Double,
    val language: String,
    val capturedAtMs: Long,
) {
    fun fields(): Map<String, Any?> = linkedMapOf(
        "id" to id,
        "text" to text,
        "speakerId" to speakerId,
        "startMs" to startMs,
        "endMs" to endMs,
        "isFinal" to isFinal,
        "confidence" to confidence,
        "language" to language,
        "capturedAtMs" to capturedAtMs,
    )
}

/**
 * One revision of my words leaving the device: the data-channel [entry] always (partials
 * included), the gateway [relay] for a final only, and the line of my own journal.
 */
data class OwnSpeechEmission(val entry: CallTranscriptEntry, val relay: CallTranscriptionSegmentWire?) {
    val journal: CallJournalSegment
        get() = CallJournalSegment(
            wireId = entry.id,
            speakerId = entry.speakerId,
            speakerDisplayName = entry.speakerDisplayName.ifBlank { null },
            text = entry.text,
            language = entry.language.ifBlank { null },
            isFinal = entry.isFinal,
            capturedAtMs = entry.capturedAtMs,
        )
}

/**
 * My utterances as they leave the device — iOS `CallTranscriptionService.applyRecognitionResult`:
 * the id is minted on the FIRST result of an utterance and shared by every partial revision and its
 * final (the merge key across transports), then released for the next one. Every revision carries
 * the clock of the utterance's start, the value the journals keep. Partials are bounded in
 * throughput ([PARTIAL_MIN_INTERVAL_MS]); the final always leaves.
 */
data class OwnSpeechStream(
    val voice: OwnSpeechVoice,
    val utteranceId: String? = null,
    val startedAtMs: Long = 0,
    val lastSentPartial: String? = null,
    val lastSentAtMs: Long = 0,
) {
    fun partial(text: String, nowMs: Long, mint: () -> String): Pair<OwnSpeechStream, OwnSpeechEmission?> {
        if (text.isBlank() || text == lastSentPartial) return this to null
        if (lastSentPartial != null && nowMs - lastSentAtMs < PARTIAL_MIN_INTERVAL_MS) return this to null
        val opened = opened(nowMs, mint)
        val next = opened.copy(lastSentPartial = text, lastSentAtMs = nowMs)
        return next to OwnSpeechEmission(next.entry(text, isFinal = false, confidence = 0.0), relay = null)
    }

    /**
     * The recognizer closed the utterance. Without words it closes what the peer already saw — the
     * last partial sent — or says nothing at all.
     */
    fun final(text: String, confidence: Double, nowMs: Long, mint: () -> String): Pair<OwnSpeechStream, OwnSpeechEmission?> {
        val words = text.takeIf { it.isNotBlank() } ?: lastSentPartial ?: return OwnSpeechStream(voice) to null
        val opened = opened(nowMs, mint)
        val relay = CallTranscriptionSegmentWire(
            id = opened.utteranceId.orEmpty(),
            text = words,
            speakerId = voice.speakerId,
            startMs = 0,
            endMs = (nowMs - opened.startedAtMs).coerceAtLeast(0),
            isFinal = true,
            confidence = confidence,
            language = voice.language,
            capturedAtMs = opened.startedAtMs,
        )
        return OwnSpeechStream(voice) to OwnSpeechEmission(opened.entry(words, isFinal = true, confidence = confidence), relay)
    }

    private fun opened(nowMs: Long, mint: () -> String): OwnSpeechStream =
        if (utteranceId != null) this else copy(utteranceId = mint(), startedAtMs = nowMs)

    private fun entry(text: String, isFinal: Boolean, confidence: Double): CallTranscriptEntry = CallTranscriptEntry(
        id = utteranceId.orEmpty(),
        callId = voice.callId,
        speakerId = voice.speakerId,
        speakerDisplayName = voice.speakerDisplayName,
        text = text,
        language = voice.language,
        capturedAtMs = startedAtMs,
        isFinal = isFinal,
        confidence = confidence,
    )

    companion object {
        const val PARTIAL_MIN_INTERVAL_MS: Long = 200
    }
}
