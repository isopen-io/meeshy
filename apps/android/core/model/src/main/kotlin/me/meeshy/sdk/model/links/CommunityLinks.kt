package me.meeshy.sdk.model.links

import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.CommunityLinkStats
import me.meeshy.sdk.model.CommunityMini

/**
 * Une communauté administrée vue comme un lien de partage (iOS `CommunityLinkService.listCommunityLinks`) :
 * son lien est `<origine web>/chat/<identifiant>` (l'URL canonique, comme `MyShareLink.joinUrl`).
 */
fun CommunityMini.toCommunityLink(webOrigin: String): CommunityLink = CommunityLink(
    id = id,
    name = name,
    identifier = identifier,
    joinUrl = "${webOrigin.trimEnd('/')}/chat/$identifier",
    memberCount = memberCount ?: 0,
    isActive = isActive,
    createdAt = createdAt,
)

fun List<CommunityLink>.toStats(): CommunityLinkStats = CommunityLinkStats(
    totalCommunities = size,
    totalMembers = sumOf { it.memberCount },
    activeCommunities = count { it.isActive },
)
