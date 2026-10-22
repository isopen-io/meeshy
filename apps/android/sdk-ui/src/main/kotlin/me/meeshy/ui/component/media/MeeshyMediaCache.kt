package me.meeshy.ui.component.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.ContentMetadata
import androidx.media3.datasource.cache.ContentMetadataMutations
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import me.meeshy.sdk.media.CachedSpanProbe
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.model.mediacache.MediaCacheBudget
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaPinTable
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

/**
 * Les deux caches Media3 de l'app : audio (200 Mo) et vidéo (1 Go), budgets lus de
 * [MediaCacheBudget]. Un média déjà écouté ou regardé se rouvre instantanément, hors réseau : la
 * lecture passe par un [CacheDataSource] dont la clé est la clé canonique ([MeeshyMediaCacheKey]).
 * L'éviction est un [PinAwareLruCacheEvictor] : jamais une épingle active, jamais une ressource
 * dont un lecteur tient un bail ([lease]). Un `SimpleCache` ne tolère qu'une instance par dossier
 * dans le processus : l'objet est donc un singleton ([get]).
 */
@UnstableApi
public class MeeshyMediaCache private constructor(context: Context) : CachedSpanProbe {
    private val appContext = context.applicationContext
    private val dirs = MediaCacheDirs(appContext.cacheDir, appContext.cacheDir)
    private val databaseProvider by lazy { StandaloneDatabaseProvider(appContext) }
    private val leases = ConcurrentHashMap<String, Int>()
    private val caches = ConcurrentHashMap<MediaCacheCategory, SimpleCache>()

    /** Le cache de [category] (AUDIO ou VIDEO), créé au premier usage. */
    @Synchronized
    public fun cacheFor(category: MediaCacheCategory): Cache {
        require(category == MediaCacheCategory.AUDIO || category == MediaCacheCategory.VIDEO) {
            "Le cache Media3 ne porte que l'audio et la vidéo, pas $category"
        }
        return caches.getOrPut(category) {
            SimpleCache(
                dirs.spansDirFor(category).apply { mkdirs() },
                PinAwareLruCacheEvictor(
                    maxBytes = MediaCacheBudget.of(category).diskMaxBytes,
                    pins = pinsReader(category),
                    inFlightKeys = { leases.keys.toSet() },
                ),
                databaseProvider,
            )
        }
    }

    /** Source de données qui lit le cache d'abord et n'appelle le réseau que pour les tronçons manquants. */
    public fun dataSourceFactory(category: MediaCacheCategory): DataSource.Factory =
        CacheDataSource.Factory()
            .setCache(cacheFor(category))
            .setCacheKeyFactory(MeeshyMediaCacheKey)
            .setUpstreamDataSourceFactory(DefaultDataSource.Factory(appContext))
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    /**
     * Fabrique de sources du lecteur pour [uri] : le cache pour le réseau (http, https), la
     * lecture directe pour un fichier ou un contenu local, que le cache ne doit pas dupliquer.
     */
    public fun mediaSourceFactory(category: MediaCacheCategory, uri: String): MediaSource.Factory {
        val scheme = Uri.parse(uri).scheme?.lowercase()
        return if (scheme == "http" || scheme == "https") {
            DefaultMediaSourceFactory(dataSourceFactory(category))
        } else {
            DefaultMediaSourceFactory(appContext)
        }
    }

    public fun exporter(category: MediaCacheCategory): MediaFileExporter =
        MediaFileExporter(dataSourceFactory(category))

    /**
     * Bail de lecture : tant qu'il n'est pas rendu, la ressource de [url] est à l'abri de
     * l'éviction. Rend la fonction qui le libère (idempotente).
     */
    public fun lease(url: String): () -> Unit {
        val key = MeeshyMediaCacheKey.of(url)
        leases.merge(key, 1, { a, b -> a + b })
        var released = false
        return {
            if (!released) {
                released = true
                leases.computeIfPresent(key) { _, n -> if (n <= 1) null else n - 1 }
            }
        }
    }

    /**
     * Adopte un fichier local (média tout juste enregistré ou envoyé) comme ressource de [url] :
     * startFile / commitFile, pour que sa lecture ne passe plus par le réseau.
     */
    public fun adoptLocalFile(category: MediaCacheCategory, url: String, file: File) {
        val cache = cacheFor(category)
        val key = MeeshyMediaCacheKey.of(url)
        val length = file.length()
        if (length <= 0L || cache.isCached(key, 0L, length)) return
        val slot = cache.startFile(key, 0L, length)
        try {
            file.copyTo(slot, overwrite = true)
            cache.commitFile(slot, length)
            cache.applyContentMetadataMutations(
                key,
                ContentMetadataMutations().also { ContentMetadataMutations.setContentLength(it, length) },
            )
        } catch (e: IOException) {
            slot.delete()
        }
    }

    override fun isFullyCached(category: MediaCacheCategory, key: String): Boolean {
        if (category != MediaCacheCategory.AUDIO && category != MediaCacheCategory.VIDEO) return false
        val cache = cacheFor(category)
        val length = ContentMetadata.getContentLength(cache.getContentMetadata(key))
        return length > 0L && cache.isCached(key, 0L, length)
    }

    /** Résolveur d'état de cache (`isCached`) branché sur les dossiers et les caches de cette instance. */
    public fun resolver(): me.meeshy.sdk.media.LocalMediaFileResolver =
        me.meeshy.sdk.media.LocalMediaFileResolver(dirs, this)

    private fun pinsReader(category: MediaCacheCategory): () -> MediaPinTable {
        val sidecar = File(dirs.dirFor(category), MediaPinTable.SIDECAR_FILE_NAME)
        var loadedAt = Long.MIN_VALUE
        var cached = MediaPinTable()
        return {
            val now = System.currentTimeMillis()
            if (now - loadedAt > PINS_REFRESH_MILLIS) {
                cached = MediaPinTable.decode(runCatching { sidecar.takeIf { it.exists() }?.readText() }.getOrNull())
                loadedAt = now
            }
            cached
        }
    }

    public companion object {
        private const val PINS_REFRESH_MILLIS = 2_000L

        @Volatile
        private var instance: MeeshyMediaCache? = null

        public fun get(context: Context): MeeshyMediaCache =
            instance ?: synchronized(this) {
                instance ?: MeeshyMediaCache(context).also { instance = it }
            }
    }
}
