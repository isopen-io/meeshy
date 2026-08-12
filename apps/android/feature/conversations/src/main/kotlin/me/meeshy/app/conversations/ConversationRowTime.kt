package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Resolves the single instant a conversation row shows as a relative timestamp —
 * the Android parity of iOS `ThemedConversationRow`'s trailing
 * `RelativeTimeFormatter.shortString(for: conversation.lastMessageAt)`.
 *
 * The row's "last activity" is the last message's send time; when no message has
 * landed yet (or it carries no timestamp) it falls back to the conversation's own
 * `updatedAt`, then its `createdAt`. The [isoToEpochMillisOrNull] SSOT parses each
 * candidate, so a blank or malformed value transparently falls through to the next
 * rather than blanking the row — and a legitimate unix-epoch instant (0L) is kept,
 * not mistaken for "absent". `null` means no candidate parsed → no timestamp shown.
 */
public object ConversationRowTime {

    public fun epochMillis(conversation: ApiConversation): Long? =
        isoToEpochMillisOrNull(conversation.lastMessage?.createdAt)
            ?: isoToEpochMillisOrNull(conversation.updatedAt)
            ?: isoToEpochMillisOrNull(conversation.createdAt)
}
