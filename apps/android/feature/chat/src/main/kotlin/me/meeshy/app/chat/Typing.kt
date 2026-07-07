package me.meeshy.app.chat

/**
 * A user currently composing a message in the conversation, identified by [userId]
 * so two distinct users who happen to share a [name] never collapse into one, and
 * stopping one never removes the other.
 */
data class TypingParticipant(
    val userId: String,
    val name: String,
)

/**
 * Pure, keyed SSOT for the "who is typing" roster, mirroring iOS
 * `ConversationSocketHandler`'s typing book-keeping. Keyed by [TypingParticipant.userId]:
 * a repeated `typing:start` from the same user refreshes their resolved name and moves
 * them to the tail (most-recent-last), the local user is never shown typing to
 * themselves, a blank resolved name falls back to the stable [userId], and a
 * `typing:stop` removes exactly that user — never a same-named other.
 */
object TypingParticipants {

    fun started(
        current: List<TypingParticipant>,
        userId: String,
        name: String,
        selfId: String? = null,
    ): List<TypingParticipant> {
        if (userId.isBlank() || userId == selfId) return current
        val resolved = name.ifBlank { userId }
        return current.filterNot { it.userId == userId } + TypingParticipant(userId, resolved)
    }

    fun stopped(
        current: List<TypingParticipant>,
        userId: String,
    ): List<TypingParticipant> = current.filterNot { it.userId == userId }
}

/**
 * How the typing indicator renders: nobody, one named user, two named users, or a
 * count when three or more are typing. Presentation SSOT so the label variant is
 * decided in pure, fully-tested code and the Composable only maps it to a string.
 */
sealed interface TypingLabel {
    data object None : TypingLabel
    data class One(val name: String) : TypingLabel
    data class Two(val first: String, val second: String) : TypingLabel
    data class Many(val count: Int) : TypingLabel

    companion object {
        fun of(participants: List<TypingParticipant>): TypingLabel = when (participants.size) {
            0 -> None
            1 -> One(participants[0].name)
            2 -> Two(participants[0].name, participants[1].name)
            else -> Many(participants.size)
        }
    }
}

/**
 * The subtitle line under the conversation title in the chat header, decided in pure
 * code so the Composable only maps a variant to a string. Mirrors iOS
 * `ConversationHeaderState` (typing dot phase) and the group member/active header: while
 * a peer is composing the subtitle shows who is typing; otherwise a group shows its
 * member count and a direct conversation shows nothing. **Typing takes priority over the
 * member count** (iOS parity — the live typing indicator supersedes the static header
 * info). A non-positive [memberCount] never renders a count, so a not-yet-loaded roster
 * shows a bare title rather than "0 members".
 */
sealed interface ChatHeaderSubtitle {
    /** No subtitle — a direct conversation with nobody typing. */
    data object None : ChatHeaderSubtitle

    /** A group's member count, shown when nobody is typing. */
    data class Members(val count: Int) : ChatHeaderSubtitle

    /** One or more peers are composing; supersedes the member count. */
    data class Typing(val label: TypingLabel) : ChatHeaderSubtitle

    companion object {
        fun of(
            memberCount: Int,
            isGroup: Boolean,
            typing: List<TypingParticipant>,
        ): ChatHeaderSubtitle =
            when (val label = TypingLabel.of(typing)) {
                TypingLabel.None ->
                    if (isGroup && memberCount > 0) Members(memberCount) else None
                else -> Typing(label)
            }
    }
}
