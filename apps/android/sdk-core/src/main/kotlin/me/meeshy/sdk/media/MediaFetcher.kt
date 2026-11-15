package me.meeshy.sdk.media

import kotlinx.coroutines.CoroutineScope
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import java.io.File

/** Un média disponible localement. [persisted] faux : `no-store` / `no-cache`, le fichier est un transit à jeter. */
class FetchedMedia(val file: File, val bytes: Long, val persisted: Boolean)

/**
 * **L'entonnoir réseau des médias** (miroir de `DiskCacheStore.data(for:profile:progress:)`, iOS) : le seul chemin par
 * lequel un média rejoint le disque. Une clé déjà là se rend SANS réseau (y compris hors ligne) ; sinon le transfert
 * est partagé avec tout autre appelant de la même clé ([SingleFlightDownloads]), écrit en flux vers un fichier de
 * transit, puis déplacé sous sa clé canonique selon la directive `Cache-Control` : `no-store` et `no-cache` ne
 * persistent rien, 404/410 nettoie la copie locale.
 */
class MediaFetcher(
    private val cache: TypedMediaCache,
    private val downloader: MediaFileDownloader,
    scope: CoroutineScope,
) {
    private val flights = SingleFlightDownloads<FetchedMedia>(scope)

    fun requestedProfile(key: String): MediaTransferProfile? = flights.requestedProfile(key)

    fun cancel(key: String) = flights.cancel(key)

    suspend fun fetch(
        category: MediaCacheCategory,
        url: String,
        expectedBytes: Long = 0L,
        profile: MediaTransferProfile = MediaTransferProfile.STANDARD,
        onProgress: (written: Long, expected: Long) -> Unit = { _, _ -> },
    ): FetchedMedia {
        cache.file(category, url)?.let { return FetchedMedia(it, it.length(), persisted = true) }
        return flights.run(url, profile, onProgress) { _, report ->
            cache.file(category, url)?.let { return@run FetchedMedia(it, it.length(), persisted = true) }
            val staged = try {
                downloader.download(url, cache.stagingDir(category), expectedBytes, report)
            } catch (gone: MediaGoneException) {
                cache.remove(category, url)
                throw gone
            }
            if (!staged.directive.mayPersist) return@run FetchedMedia(staged.file, staged.bytes, persisted = false)
            val stored = cache.store(category, url, staged.file, inFlightKeys = setOf(MediaCacheKey.of(url)))
            FetchedMedia(stored, stored.length(), persisted = true)
        }
    }
}
