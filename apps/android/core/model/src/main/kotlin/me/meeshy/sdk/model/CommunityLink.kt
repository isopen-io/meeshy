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
    /** Le lien d'entrée est en pause (#20255), lu de `GET /communities/mine` ; `null` : passerelle qui ne le sert pas. */
    val joinLinkPaused: Boolean? = null,
) {
    companion object {
        /**
         * L'adresse partagée d'une communauté (#20330) : sa page, marquée `?via=link` pour que l'entrée par elle se
         * compte et se refuse quand le lien est en pause (#19661). Même adresse que le web et iOS ; `/chat/<identifiant>`
         * ne résout qu'un lien de CONVERSATION et n'ouvrait jamais la communauté.
         */
        fun canonicalJoinUrl(baseUrl: String, identifier: String): String =
            "${baseUrl.trimEnd('/')}/communities/${java.net.URLEncoder.encode(identifier, "UTF-8").replace("+", "%20")}?via=link"

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
