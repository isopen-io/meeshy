package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Une arrivée par un lien de partage — tolérante : un champ absent ne fait pas échouer la page. */
@Serializable
data class ShareLinkArrivalEntry(
    val id: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
    val language: String? = null,
    val country: String? = null,
    val isAnonymous: Boolean = false,
    val arrivedAt: String? = null,
)

/** Une page des arrivées d'un lien, la plus récente d'abord ; `nextCursor` est celui que la passerelle a rendu. */
@Serializable
data class ShareLinkArrivalsPage(
    val arrivals: List<ShareLinkArrivalEntry> = emptyList(),
    val nextCursor: String? = null,
) {
    val cursorOrNull: String? get() = nextCursor?.takeIf { it.isNotEmpty() }
}

@Serializable
data class ShareLinkLanguageCount(val language: String = "", val count: Int = 0)

@Serializable
data class ShareLinkCountryCount(val country: String = "", val count: Int = 0)

/** Visites, arrivées, langues et pays des arrivants d'UN lien (`GET /links/:linkId/stats`). */
@Serializable
data class ShareLinkArrivalStats(
    val visits: Int = 0,
    val arrivals: Int = 0,
    val anonymousArrivals: Int = 0,
    val arrivalsByLanguage: List<ShareLinkLanguageCount> = emptyList(),
    val arrivalsByCountry: List<ShareLinkCountryCount> = emptyList(),
    val recentArrivals: List<ShareLinkArrivalEntry> = emptyList(),
)
