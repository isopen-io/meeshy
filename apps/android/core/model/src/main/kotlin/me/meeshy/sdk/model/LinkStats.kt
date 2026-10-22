package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Une carte « MES LIENS » : ses chiffres, ou leur absence. Chaque source échoue
 * indépendamment — [Unavailable] ne dit jamais « zéro », il dit « inconnu » :
 * hors ligne ou en erreur, aucune valeur n'est fabriquée.
 */
sealed interface LinkStatsCard<out T> {
    data class Loaded<T>(val value: T) : LinkStatsCard<T>
    data object Unavailable : LinkStatsCard<Nothing>

    val valueOrNull: T? get() = (this as? Loaded<T>)?.value
}

/** Les quatre sources du tableau « MES LIENS » : suivi, parrainage, partage, communautés. */
data class LinkStatsSnapshot(
    val tracking: LinkStatsCard<TrackingLinkStats> = LinkStatsCard.Unavailable,
    val affiliate: LinkStatsCard<AffiliateStats> = LinkStatsCard.Unavailable,
    val share: LinkStatsCard<MyShareLinkStats> = LinkStatsCard.Unavailable,
    val community: LinkStatsCard<CommunityLinkStats> = LinkStatsCard.Unavailable,
)

/** Une communauté vue comme un lien de partage — port de `APICommunityMini` (CommunityLinkService.swift). */
@Serializable
data class CommunityMini(
    val id: String,
    val name: String = "",
    val identifier: String = "",
    val isActive: Boolean = true,
    val memberCount: Int? = null,
    val createdAt: String? = null,
)

/** Port de `CommunityLinkStats` : totaux calculés sur les communautés administrées. */
data class CommunityLinkStats(
    val totalCommunities: Int,
    val totalMembers: Int,
    val activeCommunities: Int,
) {
    companion object {
        fun from(communities: List<CommunityMini>): CommunityLinkStats = CommunityLinkStats(
            totalCommunities = communities.size,
            totalMembers = communities.sumOf { it.memberCount ?: 0 },
            activeCommunities = communities.count { it.isActive },
        )
    }
}

/**
 * Corps de `POST /tracking-links` : la passerelle ENVELOPPE le lien (`trackingLink`, `existed`) ;
 * la forme antérieure pose le lien directement sous `data` (`shortUrl` à la racine) et se lit encore.
 */
@Serializable
data class CreatedTrackingLinkPayload(
    val trackingLink: TrackingLink? = null,
    val existed: Boolean = false,
    val shortUrl: String? = null,
) {
    val resolvedShortUrl: String? get() = (trackingLink?.shortUrl ?: shortUrl)?.takeIf { it.isNotBlank() }
}

/** Réponse de `GET /tracking-links/user/me`. */
@Serializable
data class TrackingLinksPage(
    val trackingLinks: List<TrackingLink> = emptyList(),
)

/** Issue de la création d'un lien court : l'adresse courte, ou une erreur typée avec repli sur l'URL brute. */
sealed interface TrackingShortLinkResult {
    data class Created(val shortUrl: String, val existed: Boolean) : TrackingShortLinkResult

    data class Failed(val reason: Reason, val fallbackUrl: String) : TrackingShortLinkResult

    enum class Reason { OFFLINE, REJECTED, UNAVAILABLE }
}
