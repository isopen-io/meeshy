package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Nested user inside a conversation participant — port of APIConversationUserNested (ConversationModels.swift). */
@Serializable
data class ApiConversationUserNested(
    val id: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
)

/** A user embedded in a conversation API response — port of APIConversationUser (ConversationModels.swift). */
@Serializable
data class ApiConversationUser(
    val id: String,
    val userId: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
    val type: String? = null,
    val user: ApiConversationUserNested? = null,
)

/** Count of attachments on a message — port of APIMessageCount (ConversationModels.swift). */
@Serializable
data class ApiMessageCount(
    val attachments: Int? = null,
)

/** Lighter conversation payload returned by PUT /conversations — port of UpdateConversationResponse (ConversationModels.swift). */
@Serializable
data class UpdateConversationResponse(
    val id: String,
    val type: String = "direct",
    val identifier: String? = null,
    val title: String? = null,
    val description: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val communityId: String? = null,
    val isActive: Boolean? = null,
    val isAnnouncementChannel: Boolean? = null,
    val defaultWriteRole: String? = null,
    val slowModeSeconds: Int? = null,
    val autoTranslateEnabled: Boolean? = null,
    val updatedAt: String? = null,
    val createdAt: String? = null,
)
