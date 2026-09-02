package me.meeshy.sdk.model

/**
 * Mirrors the gateway's single share-link minting policy, `mayMintShareLink`
 * (`services/gateway/src/routes/links/utils/share-link-mint.ts`) — three regimes
 * by conversation type, not one rule for all non-direct conversations:
 * - `public`: any member (membership is already implied by appearing in the
 *   reader's own conversation list).
 * - `global`: PLATFORM admin/bigboss ([platformRole]), the conversation-level
 *   role is irrelevant.
 * - everything else (`group`, `community`, a future type): at least
 *   [MemberRole.MODERATOR] within the conversation.
 *
 * The reader's conversation-level role is read from [ApiConversation.currentUserRole]
 * (the server-computed, authoritative field) first, falling back to scanning
 * [ApiConversation.participants] only when that field is absent — `GET /conversations`
 * truncates `participants` to 5 with no `orderBy`, so a moderator outside the
 * first 5 would otherwise decode as [MemberRole.MEMBER].
 */
object ShareLinkEligibility {

    fun isEligible(
        conversation: ApiConversation,
        currentUserId: String?,
        platformRole: UserRole = UserRole.USER,
    ): Boolean = when (conversation.type.lowercase()) {
        "direct" -> false
        "public" -> true
        "global" -> platformRole.rank >= UserRole.ADMIN.rank
        else -> conversationRole(conversation, currentUserId).hasMinimumRole(MemberRole.MODERATOR)
    }

    fun eligibleConversations(
        conversations: List<ApiConversation>,
        currentUserId: String?,
        platformRole: UserRole = UserRole.USER,
    ): List<ApiConversation> = conversations.filter { isEligible(it, currentUserId, platformRole) }

    private fun conversationRole(conversation: ApiConversation, currentUserId: String?): MemberRole =
        conversation.currentUserRole?.let(MemberRole::from)
            ?: conversation.currentUserRole(currentUserId)
}
