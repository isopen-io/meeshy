package me.meeshy.ui.component.media

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSink
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.ContentMetadata
import androidx.media3.datasource.cache.ContentMetadataMutations
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import me.meeshy.sdk.media.CachedSpanProbe
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.UploadedMediaCache
import me.meeshy.sdk.model.media.MediaNetworkStack
import me.meeshy.sdk.model.mediacache.MediaCacheBudget
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaPinTable
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import okhttp3.Call

/**
 * Les deux caches Media3 de l'app : audio (200 Mo) et vidéo (1 Go), budgets lus de
 * [MediaCacheBudget]. Un média déjà écouté ou regardé se rouvre instantanément, hors réseau : la
 * lecture passe par un [CacheDataSource] dont la clé est la clé canonique ([MeeshyMediaCacheKey]).
 * L'éviction est un [PinAwareLruCacheEvictor] : jamais une épingle active, jamais une ressource
 * dont un lecteur tient un bail ([lease]). Un `SimpleCache` ne tolère qu'une instance par dossier
 * dans le processus : l'objet est donc un singleton ([get]).
 *
 * Le réseau passe par [networkCallFactory] (#14567, #14613) : le client OkHttp des médias, dérivé du pool partagé
 * (HTTP/2, multiplexage) sans les intercepteurs d'API, qui pose l'identité à CHAQUE SAUT et seulement vers la route des
 * sons. Tant que l'app ne l'a pas installé, la pile intégrée de Media3 lit SANS identité, et ce repli se compte
 * ([MediaNetworkStack]).
 *
 * Chaque catégorie a son époque de compte ([AccountEpochGate], #13573) : la purge d'un changement de compte la ferme,
 * un flux ouvert avant elle s'arrête, et aucun tronçon commencé avant elle ne se valide après elle.
 */
@UnstableApi
public class MeeshyMediaCache private constructor(context: Context) : CachedSpanProbe, UploadedMediaCache {
    private val appContext = context.applicationContext
    private val dirs = MediaCacheDirs(appContext.cacheDir, appContext.cacheDir)
    private val databaseProvider by lazy { StandaloneDatabaseProvider(appContext) }
    private val leases = ConcurrentHashMap<String, Int>()
    private val caches = ConcurrentHashMap<MediaCacheCategory, SimpleCache>()
    private val gates = ConcurrentHashMap<MediaCacheCategory, AccountEpochGate>()

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
    public fun dataSourceFactory(category: MediaCacheCategory): CacheDataSource.Factory =
        CacheDataSource.Factory()
            .setCache(cacheFor(category))
            .setCacheKeyFactory(MeeshyMediaCacheKey)
            .setUpstreamDataSourceFactory(AccountFencedDataSourceFactory(networkSourceFactory(), gateFor(category)))
            .setCacheWriteDataSinkFactory(writeSinkFactory(category))
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    /** L'écriture du cache de [category] : un tronçon ne se valide que dans l'époque de compte où son flux s'est ouvert. */
    internal fun writeSinkFactory(category: MediaCacheCategory): DataSink.Factory =
        AccountFencedSinkFactory(cacheFor(category), gateFor(category))

    /**
     * Lecture directe par le client des médias, SANS cache ni bail : ce qu'un média protégé (éphémère, vue unique,
     * flouté, chiffré) emprunte, car aucun de ses octets ne doit toucher le disque.
     */
    public fun uncachedDataSourceFactory(): DataSource.Factory = networkSourceFactory()

    /** La fabrique de sources du lecteur sur [uncachedDataSourceFactory]. */
    public fun uncachedMediaSourceFactory(): MediaSource.Factory = DefaultMediaSourceFactory(uncachedDataSourceFactory())

    private fun gateFor(category: MediaCacheCategory): AccountEpochGate = gates.getOrPut(category) { AccountEpochGate() }

    private fun networkSourceFactory(): DataSource.Factory {
        val client = networkCallFactory
        if (MediaNetworkStack.of(mediaClientInstalled = client != null).reported) reportBuiltInFallback()
        return if (client != null) {
            DefaultDataSource.Factory(appContext, OkHttpDataSource.Factory(client))
        } else {
            DefaultDataSource.Factory(appContext)
        }
    }

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

    /**
     * Met entière dans le cache de [category] la ressource de [url] (#14652) — par la MÊME source que le lecteur, si
     * bien que la vidéo se rouvre ensuite sans réseau. Déjà là, rien ne part ; un échec ou une annulation n'annonce rien.
     */
    public suspend fun prefetch(category: MediaCacheCategory, url: String): Boolean = runInterruptible(Dispatchers.IO) {
        if (isFullyCached(category, MeeshyMediaCacheKey.of(url))) return@runInterruptible true
        try {
            CacheWriter(dataSourceFactory(category).createDataSource(), DataSpec(Uri.parse(url)), null, null).cache()
            true
        } catch (_: IOException) {
            false
        }
    }

    public fun exporter(category: MediaCacheCategory): MediaFileExporter =
        MediaFileExporter(dataSourceFactory(category))

    /**
     * Vide [category] : chaque ressource du cache disque part (changement de compte, déconnexion), et l'époque de compte
     * se ferme d'abord — un lecteur encore actif ne valide plus rien de ce qu'il avait commencé (#13573).
     */
    public fun clear(category: MediaCacheCategory) {
        val cache = cacheFor(category)
        gateFor(category).close { cache.keys.toList().forEach { key -> runCatching { cache.removeResource(key) } } }
    }

    /** Le dossier des tronçons de [category], tel que `SimpleCache` l'écrit et le relit au démarrage. */
    internal fun spansDir(category: MediaCacheCategory): File = dirs.spansDirFor(category)

    /** Octets que [category] occupe sur le disque, tels que le cache les compte (tronçons validés). */
    public fun diskBytes(category: MediaCacheCategory): Long = cacheFor(category).cacheSpace

    /** Retire de l'audio et de la vidéo la ressource de [url] (pièce supprimée) ; absente, rien ne se passe. */
    public fun evict(url: String) {
        val key = MeeshyMediaCacheKey.of(url)
        listOf(MediaCacheCategory.AUDIO, MediaCacheCategory.VIDEO).forEach { category ->
            val cache = cacheFor(category)
            runCatching { cache.removeResource(key) }
        }
    }

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
     * Adopte les octets d'un média tout juste envoyé comme la ressource de [url] (#13861) : sa lecture ne passe plus par
     * le réseau. Le trou de la ressource est VERROUILLÉ avant l'écriture (`startReadWriteNonBlocking`) et rendu quoi
     * qu'il arrive (`releaseHoleSpan`) ; une ressource déjà en écriture par un lecteur, déjà présente en partie, ou une
     * source qui échoue ou ne rend pas [length] octets n'adopte rien et ne laisse aucun tronçon.
     */
    override fun adopt(category: MediaCacheCategory, url: String, length: Long, open: () -> InputStream): Boolean {
        if (length <= 0L) return false
        val cache = cacheFor(category)
        val key = MeeshyMediaCacheKey.of(url)
        if (isFullyCached(category, key)) return true
        val gate = gateFor(category)
        val stamp = gate.epoch
        val hole = runCatching { cache.startReadWriteNonBlocking(key, 0L, length) }.getOrNull() ?: return false
        if (hole.isCached) return cache.isCached(key, 0L, length)
        try {
            return writeHole(cache, key, length, open, gate, stamp)
        } finally {
            cache.releaseHoleSpan(hole)
        }
    }

    private fun writeHole(
        cache: Cache,
        key: String,
        length: Long,
        open: () -> InputStream,
        gate: AccountEpochGate,
        stamp: Long,
    ): Boolean {
        val slot = try {
            gate.within(stamp) { cache.startFile(key, 0L, length).also(gate::track) }
        } catch (failure: IOException) {
            return false
        }
        val written = try {
            gate.within(stamp) { slot.outputStream().use { out -> open().use { input -> copyExactly(input, out, length) } } }
        } catch (failure: Exception) {
            false
        }
        if (!written) {
            gate.abandon(slot)
            return false
        }
        return try {
            var committed = false
            gate.commitIfCurrent(
                stamp,
                slot,
                commit = {
                    cache.applyContentMetadataMutations(
                        key,
                        ContentMetadataMutations().also { ContentMetadataMutations.setContentLength(it, length) },
                    )
                    cache.commitFile(slot, length)
                    committed = true
                },
                discard = { slot.delete() },
            )
            committed && cache.isCached(key, 0L, length)
        } catch (failure: IOException) {
            slot.delete()
            false
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
        private const val TAG = "MeeshyMediaCache"
        private val builtInFallbacks = AtomicInteger()

        /** Combien de fois un cache média a dû lire par la pile intégrée, sans client des médias installé (#14613). */
        public val builtInFallbackCount: Int get() = builtInFallbacks.get()

        private fun reportBuiltInFallback() {
            if (builtInFallbacks.getAndIncrement() == 0) {
                Log.w(TAG, "client des médias absent : lecture par la pile intégrée, sans identité ni épinglage")
            }
        }

        /** Le client HTTP des médias, installé au démarrage par l'app (`MediaCredentialInitializer`). */
        @Volatile
        public var networkCallFactory: Call.Factory? = null

        @Volatile
        private var instance: MeeshyMediaCache? = null

        public fun get(context: Context): MeeshyMediaCache =
            instance ?: synchronized(this) {
                instance ?: MeeshyMediaCache(context).also { instance = it }
            }
    }
}
