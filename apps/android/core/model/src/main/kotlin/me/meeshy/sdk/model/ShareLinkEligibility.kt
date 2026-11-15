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

    /** The picker sections, in display order, filtered by a trimmed case-insensitive title [query]. */
    fun sections(
        conversations: List<ApiConversation>,
        query: String,
        title: (ApiConversation) -> String,
    ): List<ShareLinkPickerGroup> {
        val needle = query.trim()
        val matching = if (needle.isEmpty()) {
            conversations
        } else {
            conversations.filter { title(it).contains(needle, ignoreCase = true) }
        }
        val bySection = matching.groupBy { ShareLinkPickerSection.of(it.type) }
        return ShareLinkPickerSection.entries.mapNotNull { section ->
            bySection[section]?.let { ShareLinkPickerGroup(section, it) }
        }
    }

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

/** The four sections of the in-form conversation picker (iOS groups, communities, channels, public). */
enum class ShareLinkPickerSection {
    Groups,
    Communities,
    Channels,
    Public,
    ;

    companion object {
        fun of(type: String): ShareLinkPickerSection = when (type.lowercase()) {
            "community" -> Communities
            "channel", "broadcast" -> Channels
            "public", "global" -> Public
            else -> Groups
        }
    }
}

data class ShareLinkPickerGroup(
    val section: ShareLinkPickerSection,
    val conversations: List<ApiConversation>,
)
