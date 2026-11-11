package me.meeshy.sdk.model.call

import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslation
import me.meeshy.sdk.lang.PrismTranslationResolver

/**
 * Who reads the live captions: their id (to recognise their own words), their name, and their
 * prism (`ReaderPrism.resolve`) that elects the served translation.
 */
data class CallCaptionReader(
    val userId: String?,
    val name: String?,
    val prism: List<String>,
)

/**
 * How long the gateway has to render a translation: past it, the waiting dots fall and the line stays in its
 * original language (the translation failed or will not come) — iOS `CallCaptionTranslationWait`.
 */
object CallCaptionTranslationWait {
    const val TIMEOUT_MS: Long = 8_000L
}

/**
 * One caption line as the call screen draws it — iOS `CallCaptionLine`. The Prisme applies: a peer's words
 * leave at once in their original language, labelled « EN » (three dots while a translation is awaited), then the
 * translation joins them, labelled « EN → FR ». Touching a translated sentence unfolds its original below it
 * ([originalBelow]) without removing the translation (the reverse when the journal is set to « Original »: a touch
 * shows the translation). My own words are never translated for me.
 */
data class CallLiveCaptionLine(
    val key: String,
    val speakerId: String,
    val speakerName: String,
    val isLocal: Boolean,
    val text: String,
    val languageTag: String?,
    val isFinal: Boolean,
    val capturedAtMs: Long,
    val isShowingOriginal: Boolean,
    val canRevealOriginal: Boolean,
    /** The original unfolded under the translation the reader touched, in secondary ink. */
    val originalBelow: String? = null,
    /** Until this instant a translation is awaited: the FINAL line of a peer whose language lies outside the prism. */
    val awaitingUntilMs: Long? = null,
    val originLanguage: String? = null,
    val servedLanguage: String? = null,
    /** The hour IN the call (« 01:15 »), set by [dated] for the journal; `null` elsewhere. */
    val timeLabel: String? = null,
) {
    val isAwaitingTranslation: Boolean get() = awaitingUntilMs != null

    /** The line at [nowMs]: the wait falls at its deadline, the origin label stays. */
    fun settled(nowMs: Long): CallLiveCaptionLine =
        if (awaitingUntilMs != null && nowMs >= awaitingUntilMs) copy(awaitingUntilMs = null) else this

    /** The line dated by the time in the call (P6.4); without a start of the call, no hour rather than a wall clock. */
    fun dated(startedAtMs: Long?): CallLiveCaptionLine = copy(timeLabel = CallJournalClock.label(capturedAtMs, startedAtMs))

    /** What TalkBack announces: the FINAL sentence of a peer only — a partial is replaced before it is read. */
    val announcement: String?
        get() = if (isFinal && !isLocal) "$speakerName : $text" else null
}

/** The projection of the journal onto the lines the band and the sheet draw. */
object CallLiveCaptionLines {

    fun line(
        segment: CallJournalSegment,
        reader: CallCaptionReader,
        peerName: String?,
        prefersOriginal: Boolean,
        isRevealed: Boolean,
        labels: CallCaptionLabels,
    ): CallLiveCaptionLine {
        val isLocal = isLocal(segment, reader)
        val translation = if (isLocal) null else served(segment, reader.prism)
        val showsOriginal = translation == null || (prefersOriginal && !isRevealed)
        val origin = segment.language?.takeIf { !isLocal && it.isNotBlank() }?.uppercase()
        val outsidePrism = origin != null && !inPrism(segment.language, reader.prism)
        val servedLanguage = translation?.takeUnless { showsOriginal }?.language?.uppercase()
        val awaits = !isLocal && segment.isFinal && translation == null && outsidePrism && reader.prism.isNotEmpty()
        return CallLiveCaptionLine(
            key = segment.key,
            speakerId = segment.speakerId,
            speakerName = speakerName(segment, isLocal, peerName, labels),
            isLocal = isLocal,
            text = if (showsOriginal || translation == null) segment.text else translation.text,
            languageTag = tag(origin, servedLanguage, showsOriginal && outsidePrism),
            isFinal = segment.isFinal,
            capturedAtMs = segment.capturedAtMs,
            isShowingOriginal = showsOriginal,
            canRevealOriginal = translation != null,
            originalBelow = segment.text.takeIf { translation != null && !prefersOriginal && isRevealed },
            awaitingUntilMs = (segment.capturedAtMs + CallCaptionTranslationWait.TIMEOUT_MS).takeIf { awaits },
            originLanguage = origin,
            servedLanguage = servedLanguage,
        )
    }

    fun lines(
        segments: List<CallJournalSegment>,
        reader: CallCaptionReader,
        peerName: String?,
        prefersOriginal: Boolean,
        revealed: Set<String>,
        labels: CallCaptionLabels,
    ): List<CallLiveCaptionLine> = segments.map {
        line(it, reader, peerName, prefersOriginal, isRevealed = it.key in revealed, labels = labels)
    }

    /** The last FINAL line of a peer, the only one worth announcing. */
    fun latestAnnouncement(lines: List<CallLiveCaptionLine>): CallLiveCaptionLine? = lines.lastOrNull { it.announcement != null }

    /** The next instant a wait falls after [nowMs], the only moment the screen has to redraw for it. */
    fun nextDeadline(lines: List<CallLiveCaptionLine>, nowMs: Long): Long? =
        lines.mapNotNull { it.awaitingUntilMs }.filter { it > nowMs }.minOrNull()

    /** Compared as the Prisme compares (rule 4): an `en-US` sentence is already in the rank `en`. */
    private fun inPrism(language: String?, prism: List<String>): Boolean {
        val key = language?.let(LanguageCodeNormalizer::normalizeForDedup) ?: return false
        return prism.any { LanguageCodeNormalizer.normalizeForDedup(it) == key }
    }

    private fun isLocal(segment: CallJournalSegment, reader: CallCaptionReader): Boolean =
        reader.userId?.takeIf { it.isNotBlank() } == segment.speakerId

    /**
     * The Prisme descent, never rewritten here: the relay's translation is a candidate, the original
     * language competes at its rank, `null` serves the original.
     */
    private fun served(segment: CallJournalSegment, prism: List<String>): PrismTranslation? {
        val text = segment.translatedText?.takeIf { it.isNotBlank() } ?: return null
        val language = segment.translatedLanguage?.takeIf { it.isNotBlank() } ?: return null
        return PrismTranslationResolver.resolve(
            originalLanguage = segment.language,
            candidates = listOf(PrismCandidate(language, text)),
            preferredLanguages = prism,
        )
    }

    /** Mine is « Me », never my name; then the call's own peer (a roster is the trusted source), then what the wire says. */
    private fun speakerName(
        segment: CallJournalSegment,
        isLocal: Boolean,
        peerName: String?,
        labels: CallCaptionLabels,
    ): String = when {
        isLocal -> labels.me
        else -> peerName?.takeIf { it.isNotBlank() } ?: segment.speakerDisplayName ?: labels.unknown
    }

    /** « EN → FR » once translated, « EN » for an original outside the prism, nothing otherwise. */
    private fun tag(origin: String?, served: String?, labelsOrigin: Boolean): String? = when {
        served != null -> origin?.let { "$it → $served" } ?: served
        labelsOrigin -> origin
        else -> null
    }
}

/** The two words a line may need that the transport cannot give: « Me » (my own lines), and an unknown speaker. */
data class CallCaptionLabels(val me: String, val unknown: String)

/**
 * Whether this call may carry live captions at all. Captions travel through the gateway in clear
 * (`call:transcription-segment` is relayed, translated and persisted): an end-to-end encrypted
 * conversation must never ask a peer to send them (fail-closed, #9224). A conversation whose regime
 * is not known yet is closed too — it opens once the regime is read as clear, read again on a tap or when the
 * regime changes during the call ([reading]).
 */
enum class CallCaptionsGate {
    Open,
    EndToEnd,
    Unresolved,
    ;

    val allowsCaptions: Boolean get() = this == Open

    /** A tap on « Sous-titres » reads the regime again only when it could not be read (#13725), once per tap. */
    val readsAgainOnTap: Boolean get() = this == Unresolved

    /**
     * The gate after a new read of the regime during the call (#13725): end to end never reopens (#12949), a
     * read that fails never closes a gate a clear regime opened, and anything else takes the new read.
     */
    fun reading(conversationId: String, isEndToEnd: Boolean?): CallCaptionsGate {
        if (this == EndToEnd) return EndToEnd
        val read = of(conversationId, isEndToEnd)
        return if (this == Open && read == Unresolved) Open else read
    }

    companion object {
        fun of(conversationId: String, isEndToEnd: Boolean?): CallCaptionsGate = when {
            conversationId.isBlank() || isEndToEnd == null -> Unresolved
            isEndToEnd -> EndToEnd
            else -> Open
        }
    }
}

/**
 * The peers whose captions panel is open (`call:transcription-active`) — iOS `listeningPeers`. My
 * own other devices echo through the room and are ignored; a peer who leaves without saying so
 * stops counting.
 */
data class CallCaptionListeners(val peers: Set<String> = emptySet()) {
    val isAnyPeerListening: Boolean get() = peers.isNotEmpty()

    fun applying(speakerId: String, active: Boolean, selfId: String?): CallCaptionListeners {
        if (speakerId.isBlank() || speakerId == selfId) return this
        return CallCaptionListeners(if (active) peers + speakerId else peers - speakerId)
    }

    fun leaving(userId: String): CallCaptionListeners = CallCaptionListeners(peers - userId)
}

/**
 * The captions state of the call screen: the panel the reader opened (the pilot of [mode], never
 * the capture), the « Original » preference, the lines touched to flip, the journal, and whether
 * this device can caption MY words ([ownSpeech], #13718).
 */
data class CallCaptionsState(
    val isPanelOpen: Boolean = false,
    val showsOriginal: Boolean = false,
    val revealed: Set<String> = emptySet(),
    val journal: CallLiveJournal = CallLiveJournal(),
    val gate: CallCaptionsGate = CallCaptionsGate.Unresolved,
    val listeners: CallCaptionListeners = CallCaptionListeners(),
    val ownSpeech: OwnSpeechSupport = OwnSpeechSupport.Unknown,
    /** The instant the media first flowed: the zero of the hour IN the call (P6.4); `null` until then. */
    val callStartedAtMs: Long? = null,
) {
    val mode: CaptionsMode get() = CaptionsMode.from(isTranscribing = isPanelOpen, showOriginalText = showsOriginal)

    /** The peer reads captions while mine are off: the button invites me to open them. */
    val invitesToOpen: Boolean get() = mode == CaptionsMode.Off && listeners.isAnyPeerListening

    /**
     * One tap on « Sous-titres »: off → translated → original → off. Turning off forgets the
     * per-line flips and the « Original » choice, never the journal (it survives a reopening, as iOS).
     * A closed gate never opens the panel.
     */
    fun advanced(): CallCaptionsState = when (mode.next) {
        CaptionsMode.Translated -> if (gate.allowsCaptions) copy(isPanelOpen = true, showsOriginal = false) else this
        CaptionsMode.Original -> copy(showsOriginal = true)
        CaptionsMode.Off -> copy(isPanelOpen = false, showsOriginal = false, revealed = emptySet())
    }

    fun togglingReveal(key: String): CallCaptionsState =
        copy(revealed = if (key in revealed) revealed - key else revealed + key)

    /**
     * The journal keeps the whole call, my captions on or off (#17342): what was transcribed for the call is
     * kept, and the gate stays on the CAPTURE side (nothing is transcribed when nobody listens, #13720). Only a
     * closed gate drops everything: an end-to-end conversation keeps no plain text.
     */
    fun receiving(segment: CallJournalSegment): CallCaptionsState =
        if (gate.allowsCaptions) copy(journal = journal.receive(segment)) else this

    /**
     * One of MY lines (#13718), iOS `appendSegment`: my capture may run for a peer while my panel is
     * closed, and my words, partials included, still enter my journal (#17342) — the gate stays on the
     * CAPTURE side. A closed gate keeps nothing.
     */
    fun receivingOwn(segment: CallJournalSegment): CallCaptionsState =
        if (gate.allowsCaptions) copy(journal = journal.receive(segment)) else this

    /** A gate that closes takes the panel down with it. */
    fun gated(gate: CallCaptionsGate): CallCaptionsState =
        if (gate.allowsCaptions) copy(gate = gate) else copy(gate = gate, isPanelOpen = false, showsOriginal = false, revealed = emptySet())
}
