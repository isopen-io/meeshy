package me.meeshy.ui.component.fullscreen

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.fullscreen.MediaChromeBackdrop
import me.meeshy.sdk.model.fullscreen.MediaChromeProbe
import me.meeshy.sdk.model.fullscreen.MediaChromeSample
import me.meeshy.sdk.model.fullscreen.MediaChromeScheme
import me.meeshy.sdk.model.media.ThumbHash
import me.meeshy.sdk.model.media.ThumbHashImage

/**
 * Une mesure par média, hors du fil principal, servie ensuite sans recalcul.
 *
 * L'empreinte thumbHash d'abord : elle est dans le modèle, sans réseau, et sa moyenne est celle
 * de l'image. Le bitmap ensuite, seulement s'il est DÉJÀ en mémoire ([bitmapInMemory]) — l'échantillonnage
 * ne télécharge ni ne décode rien que la surface n'ait déjà. La mémoire est bornée ([maxEntries],
 * LRU) : un fil qui défile sur des milliers de réels ne la fait pas grossir sans fin.
 * Miroir de `MediaLuminanceSampler` (iOS).
 */
public class MediaLuminanceSampler(
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val bitmapInMemory: (String) -> ThumbHashImage? = { null },
    private val decodeThumbHash: (String) -> ThumbHashImage? = ThumbHash::decodeBase64,
    private val maxEntries: Int = DEFAULT_MAX_ENTRIES,
) {
    private val memory = object : LinkedHashMap<String, Double>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Double>): Boolean = size > maxEntries
    }

    public val size: Int get() = synchronized(memory) { memory.size }

    public fun memoized(backdrop: MediaChromeBackdrop?): MediaChromeSample? = backdrop?.let { recall(it.key) }

    public fun memoized(probe: MediaChromeProbe?): MediaChromeSample? = probe?.let { recall(it.key) }

    /** La luminance moyenne du média entier (contrôle sur verre). */
    public suspend fun sample(backdrop: MediaChromeBackdrop?): MediaChromeSample? {
        backdrop ?: return null
        return measure(backdrop.key, backdrop, MediaChromeScheme::averageRelativeLuminance)
    }

    /** La luminance SOUS un contrôle : une mesure par média ET par cellule. */
    public suspend fun sample(probe: MediaChromeProbe?): MediaChromeSample? {
        probe ?: return null
        val placement = probe.placement
        return measure(probe.key, probe.backdrop) { placement.luminance(it) }
    }

    private fun recall(key: String): MediaChromeSample? =
        synchronized(memory) { memory[key] }?.let { MediaChromeSample(key, it) }

    private suspend fun measure(
        key: String,
        backdrop: MediaChromeBackdrop,
        law: (ThumbHashImage) -> Double?,
    ): MediaChromeSample? {
        recall(key)?.let { return it }
        val value = withContext(dispatcher) { source(backdrop)?.let(law) } ?: return null
        synchronized(memory) { memory[key] = value }
        return MediaChromeSample(key, value)
    }

    private fun source(backdrop: MediaChromeBackdrop): ThumbHashImage? =
        backdrop.thumbHash?.let(decodeThumbHash) ?: backdrop.bitmapUrl?.let(bitmapInMemory)

    public companion object {
        public const val DEFAULT_MAX_ENTRIES: Int = 512

        /** L'instance de l'application : une mémoire partagée par toutes les surfaces. */
        public val shared: MediaLuminanceSampler by lazy { MediaLuminanceSampler() }
    }
}
