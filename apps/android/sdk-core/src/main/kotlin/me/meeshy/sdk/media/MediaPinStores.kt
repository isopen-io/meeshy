package me.meeshy.sdk.media

import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaPinTable

/**
 * Les magasins d'épingles du cache média, UN par catégorie, partagés par tout le processus : l'épinglage d'une story
 * et l'éviction LRU du cache typé lisent ainsi la même table. Le sidecar `.pins.json` est celui que lit aussi le cache
 * Media3 de lecture.
 */
class MediaPinStores(
    private val dirs: MediaCacheDirs,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val stores = HashMap<MediaCacheCategory, MediaPinStore>()

    @Synchronized
    fun of(category: MediaCacheCategory): MediaPinStore =
        stores.getOrPut(category) { MediaPinStore(dirs.dirFor(category), clock) }

    suspend fun tableOf(category: MediaCacheCategory): MediaPinTable = of(category).snapshot()
}
