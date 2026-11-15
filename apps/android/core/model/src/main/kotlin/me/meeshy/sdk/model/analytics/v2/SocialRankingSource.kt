package me.meeshy.sdk.model.analytics.v2

/**
 * D'où vient le classement d'un listing, servi par la passerelle. Miroir de
 * `RANKING_SOURCES` (`packages/shared/types/social-events-v2.ts`) et de
 * `SocialRankingSource` iOS.
 */
enum class SocialRankingSource(val wire: String) {
    FOLLOWING("following"),
    FOR_YOU("for_you"),
    TRENDING("trending"),
    NEARBY("nearby"),
    SEARCH("search"),
    HASHTAG("hashtag"),
    SOUND("sound"),
    PROFILE("profile"),
    BOOKMARKS("bookmarks"),
    OTHER("other");

    companion object {
        /** Une valeur servie inconnue (ou absente) se rabat sur [OTHER], jamais une erreur. */
        fun served(value: String?): SocialRankingSource =
            entries.firstOrNull { it.wire == value } ?: OTHER
    }
}

/** Le contexte de listing d'un événement émis DEPUIS un listing. */
data class SocialListing(
    val feedRequestId: String? = null,
    val position: Int? = null,
    val rankingSource: SocialRankingSource? = null,
    val listingSessionId: String? = null,
)
