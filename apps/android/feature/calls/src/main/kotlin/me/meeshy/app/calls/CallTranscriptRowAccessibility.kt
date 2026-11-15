package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallTranscriptLine
import me.meeshy.sdk.model.call.CallTranscriptSecondaryKind

/** #17896 — what TalkBack reads of one journal row after the call, in the order the eye reads it. */
internal object CallTranscriptRowAccessibility {
    /** « Zoé, 0:12 : leading line. Original : … » — or « Traduit : … » once the switch shows the original. */
    fun label(line: CallTranscriptLine, showOriginal: Boolean, originalWord: String, translatedWord: String): String {
        val spoken = listOfNotNull(line.speakerName, line.elapsedLabel).joinToString(", ") + " : " + line.text(showOriginal)
        val below = line.secondary(showOriginal) ?: return spoken
        val word = when (below.kind) {
            CallTranscriptSecondaryKind.ORIGINAL -> originalWord
            CallTranscriptSecondaryKind.TRANSLATED -> translatedWord
        }
        return "$spoken. $word : ${below.text}"
    }
}
