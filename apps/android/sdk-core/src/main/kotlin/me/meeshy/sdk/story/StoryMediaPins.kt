package me.meeshy.sdk.story

import me.meeshy.sdk.media.MediaPinStores
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaStoreRouter
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import java.time.Instant

/**
 * **L'épinglage hors ligne des médias de story** (iOS `pinStoryMediaForOfflineReplay` / `releaseOfflineMedia`). Une
 * story VUE doit se relire sans réseau : ses médias sont épinglés dans le magasin de leur type EFFECTIF jusqu'à son
 * expiration (à défaut, création + 20 h), donc à l'abri de l'éviction LRU. Les épingles échues s'auto-purgent.
 *
 * À la purge d'une story, les épingles sont RELÂCHÉES sans supprimer les octets : un repost survivant peut partager le
 * même média, qui repasse simplement sous le régime normal du cache.
 */
class StoryMediaPins(
    private val stores: MediaPinStores,
    private val resolve: (String) -> String = { it },
    private val clock: () -> Long = System::currentTimeMillis,
) {
    suspend fun pin(story: StoryItem) {
        val until = deadline(story)
        if (until <= clock()) return
        targets(story).forEach { (category, url) -> stores.of(category).pin(url, until) }
    }

    suspend fun release(story: StoryItem) {
        targets(story).forEach { (category, url) -> stores.of(category).unpin(url) }
    }

    private fun targets(story: StoryItem): List<Pair<MediaCacheCategory, String>> =
        story.media.mapNotNull { media ->
            val url = media.url?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            StoryMediaStoreRouter.category(StoryMediaStoreRouter.effectiveKind(media.type, url)) to resolve(url)
        }.distinct()

    companion object {
        /** Échéance de l'épingle : `expiresAt`, sinon création + 20 h ; illisible ⇒ déjà échue (rien n'est épinglé). */
        fun deadline(story: StoryItem): Long {
            parse(story.expiresAt)?.let { return it }
            val created = parse(story.createdAt) ?: return 0L
            return created + StoryItem.DEFAULT_EXPIRY_MILLIS
        }

        private fun parse(iso: String?): Long? =
            iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
    }
}
