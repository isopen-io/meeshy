package me.meeshy.sdk.post

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.SocialListing
import me.meeshy.sdk.model.analytics.SocialRankingSource

/**
 * Retient, pour chaque post d'une page servie, l'identifiant de la page (`meta.feedRequestId`) et son
 * rang : l'impression qu'une carte émet le recopie. `searchId` est gardé pour les appels qui suivent une
 * recherche. Borné : un registre qui grossit sans fin serait une fuite mémoire.
 */
@Singleton
class FeedListingRegistry @Inject constructor() {

    private val listings = object : LinkedHashMap<String, SocialListing>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, SocialListing>): Boolean = size > CAPACITY
    }

    @Volatile
    var searchId: String? = null
        private set

    fun note(surface: ContentSurface, feedRequestId: String?, postIds: List<String>) {
        if (feedRequestId == null) return
        val ranking = rankingOf(surface)
        synchronized(listings) {
            postIds.forEachIndexed { index, id ->
                listings[id] = SocialListing(feedRequestId = feedRequestId, position = index, rankingSource = ranking)
            }
        }
    }

    fun noteSearch(searchId: String?) {
        if (searchId != null) this.searchId = searchId
    }

    fun listingFor(postId: String): SocialListing? = synchronized(listings) { listings[postId] }

    private fun rankingOf(surface: ContentSurface): SocialRankingSource? = when (surface) {
        ContentSurface.HASHTAG -> SocialRankingSource.HASHTAG
        ContentSurface.NEARBY -> SocialRankingSource.NEARBY
        ContentSurface.SOUND -> SocialRankingSource.SOUND
        ContentSurface.PROFILE -> SocialRankingSource.PROFILE
        ContentSurface.BOOKMARKS -> SocialRankingSource.BOOKMARKS
        else -> null
    }

    private companion object {
        const val CAPACITY = 1_000
    }
}
