package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Conversation — port of APIConversation (ConversationModels.swift). */
@Serializable
data class ApiConversation(
    val id: String,
    val identifier: String? = null,
    val type: String = "direct",
    val title: String? = null,
    val description: String? = null,
    val avatar: String? = null,
    val avatarThumbHash: String? = null,
    val banner: String? = null,
    val participants: List<ApiParticipant> = emptyList(),
    val lastMessage: ApiConversationLastMessage? = null,
    val unreadCount: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val defaultWriteRole: String? = null,
    val isAnnouncementChannel: Boolean = false,
    val slowModeSeconds: Int? = null,
    /** The conversation's encryption posture (`"e2ee"` / `"server"` / `"hybrid"`),
     * or `null` when it is not encrypted. Drives the top-of-history E2EE notice. */
    val encryptionMode: String? = null,
    val autoTranslateEnabled: Boolean? = null,
    val isActive: Boolean? = null,
    val preferences: ApiConversationPreferences? = null,
    val userPreferences: List<ApiConversationPreferences> = emptyList(),
) {
    val memberCount: Int get() = participants.size

    /**
     * The effective per-user preferences. The gateway sends the signed-in user's
     * row as `userPreferences[0]`; [preferences] is only ever set locally by an
     * optimistic mutation, so an in-flight override wins over the server value.
     */
    val resolvedPreferences: ApiConversationPreferences?
        get() = preferences ?: userPreferences.firstOrNull()
}

/**
 * The signed-in user's own [MemberRole] within this conversation — looked up
 * from [ApiConversation.participants] by [currentUserId], defaulting to
 * [MemberRole.MEMBER] (matching [MemberRole.from]) when the id is absent or
 * not found in the roster. Gates creator-only affordances (e.g. deleting the
 * conversation for every participant) without a separate member-list fetch.
 */
fun ApiConversation.currentUserRole(currentUserId: String?): MemberRole =
    MemberRole.from(participants.firstOrNull { it.userId == currentUserId }?.role)

@Serializable
data class ApiParticipant(
    val id: String,
    val userId: String? = null,
    val displayName: String? = null,
    val username: String? = null,
    val avatar: String? = null,
    val role: String? = null,
    val joinedAt: String? = null,
)

@Serializable
data class ApiConversationLastMessage(
    val id: String? = null,
    val content: String? = null,
    val senderId: String? = null,
    val senderName: String? = null,
    val messageType: String? = null,
    val originalLanguage: String? = null,
    val createdAt: String? = null,
)

/** User-scoped conversation preferences. */
@Serializable
data class ApiConversationPreferences(
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val isArchived: Boolean = false,
    val deletedForUserAt: String? = null,
    val customName: String? = null,
    val categoryId: String? = null,
    val mentionsOnly: Boolean = false,
    val reaction: String? = null,
    val tags: List<String> = emptyList(),
)

@Serializable
data class CreateConversationRequest(
    val type: String,
    val title: String? = null,
    val participantIds: List<String>,
)

/**
 * Total unread-message count across a conversation list — the single source of
 * truth for both the in-app dashboard preview (`DashboardScreen.dashboardUnreadTotal`)
 * and the home-screen widget's unread badge, so the two surfaces can never drift.
 */
fun List<ApiConversation>.totalUnreadCount(): Int = sumOf { it.unreadCount }
