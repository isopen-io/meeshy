package me.meeshy.app.chat

import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MentionCandidate

/**
 * Builds the mention candidate roster from a conversation's participants. This is
 * product orchestration (it belongs in `:feature:chat`, not the SDK): it encodes
 * the Meeshy rules that you don't @-mention yourself and can't address a mention
 * to a blank handle. Display name degrades to the username when absent.
 */
object MentionRoster {

    fun fromParticipants(
        participants: List<ApiParticipant>,
        excludeUserId: String?,
    ): List<MentionCandidate> =
        participants.mapNotNull { participant ->
            val username = participant.username?.trim().orEmpty()
            if (username.isEmpty()) return@mapNotNull null
            val id = participant.userId ?: participant.id
            if (id == excludeUserId) return@mapNotNull null
            MentionCandidate(
                id = id,
                username = username,
                displayName = participant.displayName?.trim()?.ifEmpty { null } ?: username,
                avatarURL = participant.avatar,
            )
        }

    /** username → display name map for resolving `@mentions` in rendered bubbles. */
    fun displayNames(candidates: List<MentionCandidate>): Map<String, String> =
        candidates.associate { it.username to it.displayName }
}
