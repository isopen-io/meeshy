package me.meeshy.sdk.model.call

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
 * One caption line as the call screen draws it — iOS `CallCaptionLine`. The Prisme applies: a
 * peer's words are read in their translation when the reader's prism elects it, marked by a discreet
 * « EN → FR » tag; touching the line shows the original (and the reverse when the journal is set
 * to « Original »). My own words are never translated for me.
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
) {
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
        val showsOriginal = translation == null || (prefersOriginal != isRevealed)
        return CallLiveCaptionLine(
            key = segment.key,
            speakerId = segment.speakerId,
            speakerName = speakerName(segment, isLocal, reader, peerName, labels),
            isLocal = isLocal,
            text = if (showsOriginal || translation == null) segment.text else translation.text,
            languageTag = translation?.takeUnless { showsOriginal }?.let { tag(segment.language, it.language) },
            isFinal = segment.isFinal,
            capturedAtMs = segment.capturedAtMs,
            isShowingOriginal = showsOriginal,
            canRevealOriginal = translation != null,
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

    /** Mine, then the call's own peer (a roster is the trusted source), then what the wire says. */
    private fun speakerName(
        segment: CallJournalSegment,
        isLocal: Boolean,
        reader: CallCaptionReader,
        peerName: String?,
        labels: CallCaptionLabels,
    ): String = when {
        isLocal -> reader.name?.takeIf { it.isNotBlank() } ?: labels.you
        else -> peerName?.takeIf { it.isNotBlank() } ?: segment.speakerDisplayName ?: labels.unknown
    }

    private fun tag(source: String?, target: String): String {
        val to = target.uppercase()
        return source?.takeIf { it.isNotBlank() }?.let { "${it.uppercase()} → $to" } ?: to
    }
}

/** The two words a line may need that the transport cannot give: « You », and an unknown speaker. */
data class CallCaptionLabels(val you: String, val unknown: String)

/**
 * Whether this call may carry live captions at all. Captions travel through the gateway in clear
 * (`call:transcription-segment` is relayed, translated and persisted): an end-to-end encrypted
 * conversation must never ask a peer to send them (fail-closed, #9224). A conversation whose regime
 * is not known yet is closed too — it opens once the regime is read as clear.
 */
enum class CallCaptionsGate {
    Open,
    EndToEnd,
    Unresolved,
    ;

    val allowsCaptions: Boolean get() = this == Open

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
 * the capture), the « Original » preference, the lines touched to flip, and the journal.
 */
data class CallCaptionsState(
    val isPanelOpen: Boolean = false,
    val showsOriginal: Boolean = false,
    val revealed: Set<String> = emptySet(),
    val journal: CallLiveJournal = CallLiveJournal(),
    val gate: CallCaptionsGate = CallCaptionsGate.Unresolved,
    val listeners: CallCaptionListeners = CallCaptionListeners(),
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
     * Reception is tied to the panel, like iOS: a closed panel drops the segment instead of piling it
     * up in silence; a closed gate drops everything.
     */
    fun receiving(segment: CallJournalSegment): CallCaptionsState =
        if (isPanelOpen && gate.allowsCaptions) copy(journal = journal.receive(segment)) else this

    /** A gate that closes takes the panel down with it. */
    fun gated(gate: CallCaptionsGate): CallCaptionsState =
        if (gate.allowsCaptions) copy(gate = gate) else copy(gate = gate, isPanelOpen = false, showsOriginal = false, revealed = emptySet())
}
