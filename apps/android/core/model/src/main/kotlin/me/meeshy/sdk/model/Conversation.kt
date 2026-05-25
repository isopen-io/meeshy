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
    val autoTranslateEnabled: Boolean? = null,
    val preferences: ApiConversationPreferences? = null,
) {
    val memberCount: Int get() = participants.size
}

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
)

@Serializable
data class CreateConversationRequest(
    val type: String,
    val title: String? = null,
    val participantIds: List<String>,
)
