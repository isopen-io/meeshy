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
    fun of(line: CallLiveCaptionLine): CallCaptionSemantics = CallCaptionSemantics(
        label = "${line.speakerName} : ${line.text}",
        isHidden = !line.isFinal,
        announces = line.announcement != null,
    )
}
