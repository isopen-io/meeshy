package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable

/**
 * One journal entry pushed peer-to-peer on the data channel — the Kotlin mirror of
 * `CallTranscriptEntryPayload` (`packages/shared/types/video-call.ts`) and of iOS
 * `DataChannelTranscriptEntry`. [speakerDisplayName] is declarative on this path (no server
 * stamps it): receivers prefer the name they resolve themselves.
 */
@Serializable
data class CallTranscriptEntry(
    val id: String = "",
    val callId: String = "",
    val speakerId: String = "",
    val speakerDisplayName: String = "",
    val text: String = "",
    val language: String = "",
    val capturedAtMs: Long = 0,
    val isFinal: Boolean = false,
    val confidence: Double = 0.0,
) {
    /** An entry without its merge key, its call, its speaker or a word carries nothing. */
    val isAddressable: Boolean
        get() = id.isNotBlank() && callId.isNotBlank() && speakerId.isNotBlank() && text.isNotBlank()
}

/**
 * One utterance of the live call journal, whatever transport brought it — iOS
 * `CallTranscriptionSegment`. [text] is ALWAYS the speaker's original words, never overwritten by
 * a translation, so the reader can flip between the two. [key] is the line's stable identity in
 * this journal (minted by [CallLiveJournal]); [wireId] is the cross-transport merge key minted by
 * the speaker's device, `null` for a legacy peer.
 */
data class CallJournalSegment(
    val key: String = "",
    val wireId: String?,
    val speakerId: String,
    val speakerDisplayName: String?,
    val text: String,
    val language: String?,
    val isFinal: Boolean,
    val capturedAtMs: Long,
    val translatedText: String? = null,
    val translatedLanguage: String? = null,
) {
    companion object {
        /**
         * iOS `makeTranscriptionSegment(from: DataChannelTranscriptEntry)`: no translation on this path.
         * The data channel of a duo carries ONE peer, so its lines speak for [channelPeerId] whatever
         * `speakerId` the payload declares (a peer could otherwise put words in my mouth); no known
         * peer, or a peer that is me, and the entry is dropped.
         */
        fun fromPeerEntry(entry: CallTranscriptEntry, channelPeerId: String, selfId: String?): CallJournalSegment? {
            if (channelPeerId.isBlank() || channelPeerId == selfId) return null
            return CallJournalSegment(
                wireId = entry.id,
                speakerId = channelPeerId,
                speakerDisplayName = entry.speakerDisplayName.ifBlank { null },
                text = entry.text,
                language = entry.language.ifBlank { null },
                isFinal = entry.isFinal,
                capturedAtMs = entry.capturedAtMs,
            )
        }

        /**
         * iOS `makeTranscriptionSegment(from: CallTranslatedSegmentData)`. The language tag is the one
         * the segment was TRANSCRIBED in; the translation carries its own. The capture clock comes
         * from the speaker's device, [receivedAtMs] only for a gateway older than the field.
         * `null` when the relay names no speaker or says nothing.
         */
        fun fromRelay(segment: CallTranslatedSegmentRef, receivedAtMs: Long): CallJournalSegment? {
            val speakerId = segment.speakerId?.takeIf { it.isNotBlank() } ?: return null
            if (segment.text.isBlank()) return null
            val translated = segment.translatedText?.takeIf { it.isNotBlank() }
            return CallJournalSegment(
                wireId = segment.id?.takeIf { it.isNotBlank() },
                speakerId = speakerId,
                speakerDisplayName = segment.speakerDisplayName?.takeIf { it.isNotBlank() },
                text = segment.text,
                language = segment.sourceLanguage?.takeIf { it.isNotBlank() },
                isFinal = segment.isFinal,
                capturedAtMs = segment.capturedAtMs ?: receivedAtMs,
                translatedText = translated,
                translatedLanguage = segment.targetLanguage?.takeIf { translated != null && it.isNotBlank() },
            )
        }
    }
}

/**
 * The merge of one utterance across its revisions and its transports — iOS
 * `CallTranscriptMergeRules`, mirror of `mergeEntries` (`packages/shared/utils/call-transcript.ts`):
 * 1. existing PARTIAL ⇒ the incoming revision REPLACES the words (the author's engine corrects
 *    itself); a final closes the utterance this way;
 * 2. existing FINAL + incoming partial ⇒ a stale revision arriving late, ignored;
 * 3. final + final (data channel, then the translated relay) ⇒ the original words are kept, the
 *    translation and a missing name come to enrich them.
 * The capture clock always keeps the EARLIEST value: the start of the utterance.
 */
object CallTranscriptMergeRules {
    fun merged(existing: CallJournalSegment, incoming: CallJournalSegment): CallJournalSegment {
        val base = existing.copy(
            speakerDisplayName = existing.speakerDisplayName ?: incoming.speakerDisplayName,
            capturedAtMs = minOf(existing.capturedAtMs, incoming.capturedAtMs),
        )
        if (!existing.isFinal) {
            return base.copy(
                text = incoming.text,
                isFinal = incoming.isFinal,
                language = incoming.language ?: existing.language,
                translatedText = incoming.translatedText ?: existing.translatedText,
                translatedLanguage = incoming.translatedLanguage ?: existing.translatedLanguage,
            )
        }
        if (!incoming.isFinal) return base
        return base.copy(
            translatedText = incoming.translatedText ?: existing.translatedText,
            translatedLanguage = incoming.translatedLanguage ?: existing.translatedLanguage,
        )
    }
}

/**
 * The live journal of a call, the single source the captions band and the journal sheet read —
 * iOS `CallTranscriptionService` (`receivePeerEntry` / `receiveTranslatedSegment` /
 * `appendSegment`) with `CallTranscriptJournal`:
 *  - an utterance already in the journal (same [CallJournalSegment.wireId] AND same speaker) is
 *    MERGED in place, never duplicated, whichever transport arrives first; a line of another speaker
 *    never rewrites it;
 *  - a new utterance first drops that speaker's in-progress line (at most one live partial per
 *    speaker), every finalized line is kept;
 *  - the lines stay sorted by capture clock (a later equal clock lands after), and the journal
 *    keeps the [CEILING] most recent ones so a marathon call stays bounded.
 */
data class CallLiveJournal(
    val segments: List<CallJournalSegment> = emptyList(),
    private val minted: Long = 0,
) {
    val isEmpty: Boolean get() = segments.isEmpty()

    /** The last [count] lines — what the band shows. */
    fun tail(count: Int): List<CallJournalSegment> = segments.takeLast(count.coerceAtLeast(0))

    fun receive(segment: CallJournalSegment): CallLiveJournal {
        val wireId = segment.wireId
        val index = if (wireId == null) -1 else segments.indexOfFirst { it.wireId == wireId && it.speakerId == segment.speakerId }
        if (index < 0) return append(segment)
        val merged = CallTranscriptMergeRules.merged(segments[index], segment)
        val others = segments.filterIndexed { i, _ -> i != index }
        return copy(segments = inserting(merged, others))
    }

    private fun append(segment: CallJournalSegment): CallLiveJournal {
        val key = "j${minted + 1}"
        val others = segments.filterNot { it.speakerId == segment.speakerId && !it.isFinal }
        val inserted = inserting(segment.copy(key = key), others)
        return CallLiveJournal(segments = inserted.takeLast(CEILING), minted = minted + 1)
    }

    private fun inserting(segment: CallJournalSegment, sorted: List<CallJournalSegment>): List<CallJournalSegment> {
        val index = sorted.indexOfFirst { it.capturedAtMs > segment.capturedAtMs }.let { if (it < 0) sorted.size else it }
        return sorted.subList(0, index) + segment + sorted.subList(index, sorted.size)
    }

    companion object {
        /** iOS `CallTranscriptJournal.ceiling`. */
        const val CEILING: Int = 10_000
    }
}

/**
 * Whether the journal sheet follows the live edge — iOS `CallJournalFollow`. At the bottom it
 * follows; scrolling UP leaves the live edge and every new line is then « unseen » until the reader
 * comes back (« Revenir au direct »). A scroll that does not go up changes nothing.
 */
data class CallJournalFollow(val isFollowing: Boolean = true, val hasUnseen: Boolean = false) {
    val showsReturnToLive: Boolean get() = !isFollowing

    fun scrolled(atLiveEdge: Boolean, movedUp: Boolean): CallJournalFollow = when {
        atLiveEdge -> LIVE
        movedUp -> CallJournalFollow(isFollowing = false, hasUnseen = hasUnseen)
        else -> this
    }

    fun lineArrived(): CallJournalFollow = if (isFollowing) this else copy(hasUnseen = true)

    companion object {
        val LIVE: CallJournalFollow = CallJournalFollow()
    }
}
