package me.meeshy.sdk.theme

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant

/**
 * Deterministic accent [DynamicColorGenerator.ColorPalette] for a conversation, via the
 * shared color algorithm — the single source of the row's `primary` avatar fill and its
 * `secondary` heat-gradient tint (parity iOS `conversation.colorPalette`). Computed once
 * so a row consuming both hues never re-derives the palette.
 */
fun ApiConversation.accentColorPalette(): DynamicColorGenerator.ColorPalette =
    // Route the wire `type` through the shared WIRE_TYPE_TO_CONTEXT_TYPE table so that
    // `public`/`global`/`broadcast` collapse onto the COMMUNITY base color, exactly as
    // web (`conversationAccentPalette`) and iOS (`MeeshyConversation.computeColorPalette`)
    // do — a local `when { … else -> DIRECT }` served those three the DIRECT color.
    DynamicColorGenerator.paletteForWire(type = type, memberCount = memberCount)

/** Deterministic accent color (hex) for a conversation, via the shared color algorithm. */
fun ApiConversation.accentHex(): String = accentColorPalette().primary

private val directConversationTypes = setOf("direct", "dm")

/**
 * The name to show for a conversation. A group/community keeps its [title]; a direct
 * conversation has no title of its own — like iOS `APIConversation.toConversation` and web
 * `titleOf` (`apps/web/src/lib/view/conversation.ts`) — so it resolves the OTHER
 * participant's name (excluding [currentUserId]) and never the stored [title], which can
 * carry a legacy artifact ("X et Y", composed client-side at creation, #6790) rather than a
 * legitimate name. A local rename ([resolvedPreferences]'s `customName`) always wins first,
 * for either kind of conversation.
 */
fun ApiConversation.displayTitle(currentUserId: String? = null): String {
    resolvedPreferences?.customName?.takeIf { it.isNotBlank() }?.let { return it }
    if (type.lowercase() in directConversationTypes) {
        return otherParticipantName(currentUserId) ?: "Conversation"
    }
    title?.takeIf { it.isNotBlank() }?.let { return it }
    return "Conversation"
}

/**
 * The other participant in a direct conversation (excluding [currentUserId]) — `null` for a
 * group/community/channel/bot conversation, or when no other participant is known.
 */
private fun ApiConversation.otherParticipant(currentUserId: String?): ApiParticipant? {
    if (type.lowercase() !in directConversationTypes) return null
    return participants.firstOrNull { it.userId != null && it.userId != currentUserId }
}

private fun ApiConversation.otherParticipantName(currentUserId: String?): String? {
    val other = otherParticipant(currentUserId) ?: return null
    return other.displayName?.takeIf { it.isNotBlank() }
        ?: other.username?.takeIf { it.isNotBlank() }
}

/**
 * The other participant's user id in a direct conversation — the presence-lookup key for a
 * conversation row/header (`ConversationListUiState.presenceStateFor` et al.). `null` for a
 * group/community/channel/bot conversation, or when no other participant is known.
 */
fun ApiConversation.otherParticipantUserId(currentUserId: String?): String? =
    otherParticipant(currentUserId)?.userId
