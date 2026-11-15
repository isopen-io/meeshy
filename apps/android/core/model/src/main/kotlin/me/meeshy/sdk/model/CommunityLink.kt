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
) {
    companion object {
        /** URL canonique de partage `/chat/<identifiant>` (`/join` n'est plus qu'une 308 legacy). */
        fun canonicalJoinUrl(baseUrl: String, identifier: String): String = "$baseUrl/chat/$identifier"

        fun of(
            id: String,
            name: String,
            identifier: String,
            baseUrl: String,
            memberCount: Int,
            isActive: Boolean,
            createdAt: String? = null,
        ): CommunityLink = CommunityLink(
            id = id,
            name = name,
            identifier = identifier,
            joinUrl = canonicalJoinUrl(baseUrl, identifier),
            memberCount = memberCount,
            isActive = isActive,
            createdAt = createdAt,
        )
    }
}

@Serializable
data class CommunityLinkStats(
    val totalCommunities: Int = 0,
    val totalMembers: Int = 0,
    val activeCommunities: Int = 0,
)
