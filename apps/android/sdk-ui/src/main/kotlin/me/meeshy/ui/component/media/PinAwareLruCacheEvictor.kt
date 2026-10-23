package me.meeshy.ui.component.media

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheEvictor
import androidx.media3.datasource.cache.CacheSpan
import me.meeshy.sdk.model.mediacache.CachedFileInfo
import me.meeshy.sdk.model.mediacache.LruEvictionPlan
import me.meeshy.sdk.model.mediacache.MediaPinTable

/**
 * Évinceur de [androidx.media3.datasource.cache.SimpleCache] qui applique [LruEvictionPlan] :
 * la ressource entière (tous ses tronçons) la moins récemment touchée part d'abord, jamais une
 * épingle active ([pins]) ni une ressource en cours de lecture ou d'écriture ([inFlightKeys]).
 * Si tout est protégé, le cache dépasse temporairement son budget et se résorbe à l'échéance
 * des épingles. Appelé sous le verrou du cache : aucun état partagé à protéger ici.
 */
@UnstableApi
public class PinAwareLruCacheEvictor(
    private val maxBytes: Long,
    private val pins: () -> MediaPinTable,
    private val inFlightKeys: () -> Set<String>,
    private val clock: () -> Long = System::currentTimeMillis,
) : CacheEvictor {

    private val spans = LinkedHashSet<CacheSpan>()
    private var currentBytes = 0L

    override fun requiresCacheSpanTouches(): Boolean = true

    override fun onCacheInitialized() = Unit

    override fun onStartFile(cache: Cache, key: String, position: Long, length: Long) {
        if (length != C.LENGTH_UNSET.toLong()) evict(cache, requiredBytes = length)
    }

    override fun onSpanAdded(cache: Cache, span: CacheSpan) {
        if (spans.add(span)) currentBytes += span.length
        evict(cache, requiredBytes = 0L)
    }

    override fun onSpanRemoved(cache: Cache, span: CacheSpan) {
        if (spans.remove(span)) currentBytes -= span.length
    }

    override fun onSpanTouched(cache: Cache, oldSpan: CacheSpan, newSpan: CacheSpan) {
        onSpanRemoved(cache, oldSpan)
        onSpanAdded(cache, newSpan)
    }

    private fun evict(cache: Cache, requiredBytes: Long) {
        val budget = maxBytes - requiredBytes
        if (currentBytes <= budget) return
        val files = spans.groupBy { it.key }.map { (key, parts) ->
            CachedFileInfo(
                key = key,
                sizeBytes = parts.sumOf { it.length },
                lastAccessEpochMillis = parts.maxOf { it.lastTouchTimestamp },
            )
        }
        val victims = LruEvictionPlan.victims(files, budget, pins(), clock(), inFlightKeys()).toSet()
        spans.filter { it.key in victims }.forEach { span ->
            runCatching { cache.removeSpan(span) }
        }
    }
}
