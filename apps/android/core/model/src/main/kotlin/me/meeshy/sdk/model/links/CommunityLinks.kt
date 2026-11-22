package me.meeshy.sdk.model.links

import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.CommunityLinkStats
import me.meeshy.sdk.model.CommunityMini

/**
 * Une communauté administrée vue comme un lien de partage (iOS `CommunityLinkService.listCommunityLinks`) :
 * son lien est l'adresse partagée de la communauté, `CommunityLink.canonicalJoinUrl` (#20330).
 */
fun CommunityMini.toCommunityLink(webOrigin: String): CommunityLink = CommunityLink(
    id = id,
    name = name,
    identifier = identifier,
    joinUrl = CommunityLink.canonicalJoinUrl(webOrigin, identifier),
    memberCount = memberCount ?: 0,
    isActive = isActive,
    createdAt = createdAt,
    joinLinkPaused = joinLinkPaused,
)

fun List<CommunityLink>.toStats(): CommunityLinkStats = CommunityLinkStats(
    totalCommunities = size,
    totalMembers = sumOf { it.memberCount },
    activeCommunities = count { it.isActive },
)
