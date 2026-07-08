package me.meeshy.app.chat

/**
 * A minimal, opaque projection of a message for reply-jump resolution: its own id
 * and the id of the message it quotes (`null` when it is not a reply). Keeping this
 * SDK-agnostic keeps [ReplyJumpResolver] a pure, fully-testable decision.
 */
data class ReplyLink(
    val id: String,
    val replyToId: String?,
)

/** Where a tap on a message's quoted-reply preview should take the user. */
sealed interface ReplyJump {
    /** Scroll to the loaded original at [targetMessageId]. */
    data class Scroll(val targetMessageId: String) : ReplyJump

    /** The original exists but isn't currently loaded (paged out) — nothing to scroll to yet. */
    data object TargetNotLoaded : ReplyJump

    /** The tap resolves to no navigation (unknown message, or not a reply). */
    data object None : ReplyJump
}

/**
 * Pure SSOT resolving a quoted-reply-preview tap into a navigation intent, mirroring
 * iOS's tap-to-scroll-to-quoted behaviour: only a reply whose original is currently
 * loaded scrolls; a paged-out original is reported distinctly so the caller stays inert
 * rather than crashing on an absent index.
 */
object ReplyJumpResolver {
    fun resolve(tappedMessageId: String, messages: List<ReplyLink>): ReplyJump {
        val tapped = messages.firstOrNull { it.id == tappedMessageId } ?: return ReplyJump.None
        val target = tapped.replyToId?.trim()?.ifBlank { null } ?: return ReplyJump.None
        if (target == tappedMessageId) return ReplyJump.None
        return if (messages.any { it.id == target }) {
            ReplyJump.Scroll(target)
        } else {
            ReplyJump.TargetNotLoaded
        }
    }
}
