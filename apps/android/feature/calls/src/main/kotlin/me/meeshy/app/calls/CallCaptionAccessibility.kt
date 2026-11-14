package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallLiveCaptionLine

/** What TalkBack gets of one caption line: its label, whether it stops on it, whether it speaks it. */
internal data class CallCaptionSemantics(
    val label: String,
    /** A partial revision is replaced before it is read: TalkBack does not stop on it. */
    val isHidden: Boolean,
    /** Only the FINAL sentence of a peer is announced — never a partial, never my own words. */
    val announces: Boolean,
)

/** The accessibility law of the live captions (iOS `CallCaptionsViews`: `accessibilityHidden(!isFinal)`, `announcement`). */
internal object CallCaptionAccessibility {
    /**
     * The label reads « name : text », then the unfolded original (« Original : … ») and, while a translation is
     * awaited, [translatingWord] (« Translating ») — null when nothing is awaited or the surface draws no wait.
     */
    fun of(line: CallLiveCaptionLine, originalWord: String, translatingWord: String?): CallCaptionSemantics = CallCaptionSemantics(
        label = listOfNotNull(
            "${line.speakerName} : ${line.text}",
            line.originalBelow?.let { ". $originalWord : $it" },
        ).joinToString("").let { spoken -> translatingWord?.let { "$spoken, $it" } ?: spoken },
        isHidden = !line.isFinal,
        announces = line.announcement != null,
    )
}
