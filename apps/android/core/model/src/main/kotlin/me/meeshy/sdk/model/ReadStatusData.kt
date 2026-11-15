package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Charge de `GET /messages/{messageId}/read-status` — miroir de
 * `MessageViewsReadStatusData.swift`. Les dates restent des chaînes ISO-8601
 * (comme [ApiMessage]) ; tout champ absent d'une vieille passerelle a un défaut.
 */
@Serializable
data class ReadStatusData(
    val messageId: String = "",
    val totalMembers: Int = 0,
    val receivedCount: Int = 0,
    val readCount: Int = 0,
    val notSeenCount: Int? = null,
    val receivedBy: List<ReceivedByUser> = emptyList(),
    val readBy: List<ReadByUser> = emptyList(),
    val notSeenBy: List<NotSeenByUser>? = null,
)

@Serializable
data class ReceivedByUser(
    val participantId: String,
    val displayName: String = "",
    val avatarURL: String? = null,
    val receivedAt: String? = null,
)

@Serializable
data class ReadByUser(
    val participantId: String,
    val displayName: String = "",
    val avatarURL: String? = null,
    val readAt: String? = null,
)

@Serializable
data class NotSeenByUser(
    val participantId: String,
    val displayName: String = "",
    val avatarURL: String? = null,
)
