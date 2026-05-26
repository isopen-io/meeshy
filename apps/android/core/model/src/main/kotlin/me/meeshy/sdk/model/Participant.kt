package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Type of a conversation participant — port of ParticipantType (ParticipantModels.swift). */
@Serializable
enum class ParticipantType {
    USER,
    ANONYMOUS,
    BOT,
}

/** Per-participant send permissions — port of ParticipantPermissions (ParticipantModels.swift). */
@Serializable
data class ParticipantPermissions(
    val canSendMessages: Boolean = true,
    val canSendFiles: Boolean = true,
    val canSendImages: Boolean = true,
    val canSendVideos: Boolean = true,
    val canSendAudios: Boolean = true,
    val canSendLocations: Boolean = true,
    val canSendLinks: Boolean = true,
)

/** Anonymous user profile — port of AnonymousProfile (ParticipantModels.swift). */
@Serializable
data class AnonymousProfile(
    val firstName: String = "",
    val lastName: String = "",
    val username: String = "",
    val email: String? = null,
    val birthday: String? = null,
)

@Serializable
data class AnonymousSessionResponse(
    val profile: AnonymousProfile,
)

/** A paginated conversation participant — port of PaginatedParticipant (ParticipantModels.swift). */
@Serializable
data class PaginatedParticipant(
    val id: String,
    val userId: String? = null,
    val username: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val conversationRole: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
    val joinedAt: String? = null,
    val isActive: Boolean? = null,
)

@Serializable
data class PaginatedParticipantsResponse(
    val success: Boolean = false,
    val data: List<PaginatedParticipant> = emptyList(),
    val pagination: PaginatedParticipantsPagination? = null,
)

@Serializable
data class PaginatedParticipantsPagination(
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
    val totalCount: Int? = null,
)

/**
 * Full conversation participant embedded in conversation responses —
 * port of APIParticipant (ParticipantModels.swift). Named distinctly from
 * the lightweight [ApiParticipant] in Conversation.kt.
 */
@Serializable
data class ApiConversationParticipant(
    val id: String,
    val conversationId: String? = null,
    val type: ParticipantType? = null,
    val userId: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val role: String? = null,
    val conversationRole: String? = null,
    val language: String? = null,
    val permissions: ParticipantPermissions? = null,
    val isActive: Boolean? = null,
    val isOnline: Boolean? = null,
    val joinedAt: String? = null,
    val leftAt: String? = null,
    val bannedAt: String? = null,
    val nickname: String? = null,
    val lastActiveAt: String? = null,
)
