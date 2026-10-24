package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable

/**
 * Every callback a [MessageBubble] can raise, bundled in one immutable value so that adding a
 * gesture is one more field with a neutral default — never one more parameter on the bubble.
 *
 * A null callback is the neutral value AND a rendering decision: the matching element is then not
 * interactive at all (no click target, no button role), exactly as the bubble behaved when each
 * callback was its own nullable parameter. [None] is the fully inert set, used by non-interactive
 * render sites such as the long-press preview.
 */
@Immutable
public data class BubbleCallbacks(
    /** Long press on the bubble body (opens the action menu). */
    val onLongPress: (() -> Unit)? = null,
    /** Tap on a reaction chip, with its emoji. */
    val onReactionClick: ((String) -> Unit)? = null,
    /** Long press on a reaction chip. */
    val onReactionLongPress: (() -> Unit)? = null,
    /** Tap on an image of the grid, with its index. */
    val onImageClick: ((Int) -> Unit)? = null,
    /** Tap on a shared location that has coordinates. */
    val onLocationClick: ((BubbleLocation) -> Unit)? = null,
    /** Tap on a playable audio attachment. */
    val onAudioClick: ((BubbleAudio) -> Unit)? = null,
    /** Tap on a file attachment that has a url. */
    val onFileClick: ((BubbleFile) -> Unit)? = null,
    /** Tap on the quoted-reply preview (only wired when the quoted message id is known). */
    val onReplyPreviewClick: (() -> Unit)? = null,
    /** Tap on a language flag of the Prisme strip, with its language code. */
    val onFlagTap: ((String) -> Unit)? = null,
) {
    public companion object {
        /** No callback at all: a purely decorative bubble. */
        public val None: BubbleCallbacks = BubbleCallbacks()
    }
}
