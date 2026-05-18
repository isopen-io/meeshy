package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A community member's user — port of APICommunityUser (CommunityModels.swift). */
@Serializable
data class ApiCommunityUser(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
)

/** A community member — port of APICommunityMember (CommunityModels.swift). */
@Serializable
data class ApiCommunityMember(
    val id: String,
    val communityId: String = "",
    val userId: String = "",
    val role: String = "member",
    val joinedAt: String? = null,
    val user: ApiCommunityUser? = null,
)

@Serializable
data class ApiCommunityCount(
    val members: Int? = null,
    @SerialName("Conversation") val conversation: Int? = null,
)

/** API community payload — port of APICommunity (CommunityModels.swift). */
@Serializable
data class ApiCommunity(
    val id: String,
    val identifier: String = "",
    val name: String = "",
    val description: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val isPrivate: Boolean = false,
    val createdBy: String = "",
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val creator: ApiCommunityUser? = null,
    val members: List<ApiCommunityMember>? = null,
    @SerialName("_count") val count: ApiCommunityCount? = null,
    val memberCount: Int? = null,
    val conversationCount: Int? = null,
)

/** A community search result — port of APICommunitySearchResult (CommunityModels.swift). */
@Serializable
data class ApiCommunitySearchResult(
    val id: String,
    val name: String = "",
    val identifier: String = "",
    val description: String? = null,
    val avatar: String? = null,
    val isPrivate: Boolean = false,
    val memberCount: Int? = null,
    val conversationCount: Int? = null,
    val createdAt: String? = null,
    val creator: ApiCommunityUser? = null,
    val members: List<ApiCommunityMember>? = null,
)

@Serializable
data class CreateCommunityRequest(
    val name: String,
    val identifier: String? = null,
    val description: String? = null,
    val isPrivate: Boolean = true,
)

@Serializable
data class UpdateCommunityRequest(
    val name: String? = null,
    val identifier: String? = null,
    val description: String? = null,
    val isPrivate: Boolean? = null,
    val avatar: String? = null,
    val banner: String? = null,
)

@Serializable
data class InviteMemberRequest(
    val userId: String,
)

@Serializable
data class IdentifierAvailability(
    val available: Boolean = false,
    val identifier: String = "",
)
