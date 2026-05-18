package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A view on the user's communities exposing their share URL — port of CommunityLink (CommunityLinkModels.swift). */
@Serializable
data class CommunityLink(
    val id: String,
    val name: String = "",
    val identifier: String = "",
    val joinUrl: String = "",
    val memberCount: Int = 0,
    val isActive: Boolean = false,
    val createdAt: String? = null,
)

@Serializable
data class CommunityLinkStats(
    val totalCommunities: Int = 0,
    val totalMembers: Int = 0,
    val activeCommunities: Int = 0,
)
