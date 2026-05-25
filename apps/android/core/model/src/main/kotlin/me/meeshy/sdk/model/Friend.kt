package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A friend request — port of FriendRequest (FriendModels.swift). */
@Serializable
data class FriendRequest(
    val id: String,
    val senderId: String = "",
    val receiverId: String = "",
    val message: String? = null,
    val status: String = "",
    val sender: FriendRequestUser? = null,
    val receiver: FriendRequestUser? = null,
    val respondedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/** A user attached to a friend request — port of FriendRequestUser (FriendModels.swift). */
@Serializable
data class FriendRequestUser(
    val id: String,
    val username: String = "",
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
)

@Serializable
data class SendFriendRequest(
    val receiverId: String,
    val message: String? = null,
)

@Serializable
data class RespondFriendRequest(
    val status: String,
)

@Serializable
data class EmailInvitationRequest(
    val email: String,
)

@Serializable
data class EmailInvitationResponse(
    val email: String = "",
    val sentAt: String? = null,
)
