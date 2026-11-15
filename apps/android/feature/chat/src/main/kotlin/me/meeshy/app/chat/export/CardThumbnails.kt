package me.meeshy.app.chat.export

import android.graphics.Bitmap
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

/**
 * LES VIGNETTES DE LA GALERIE — chaque template est montré par sa VRAIE carte, peinte sur le
 * message de l'utilisateur. Une vignette coûte une peinture : elle ne se demande qu'à l'entrée à
 * l'écran (LazyGrid), DEUX à la fois, hors du thread principal. Le cache est BORNÉ en octets, et
 * une clé nomme le template ET l'état de la carte : changer un détail ne ressert jamais une
 * vignette périmée.
 */
class CardThumbnailStore(maxBytes: Int = DEFAULT_BYTES) {
    private val cache = object : LruCache<String, Bitmap>(maxBytes) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
    }
    private val gate = Semaphore(2)

    fun cached(key: String): Bitmap? = cache.get(key)

    suspend fun image(key: String, input: CardInput, width: Int, pictures: Map<String, Bitmap> = emptyMap()): Bitmap {
        cached(key)?.let { return it }
        return gate.withPermit {
            cached(key) ?: withContext(Dispatchers.Default) { CardRenderer.thumbnail(input, width, pictures) }.also { cache.put(key, it) }
        }
    }

    fun clear() = cache.evictAll()

    private companion object {
        const val DEFAULT_BYTES = 24 * 1024 * 1024
    }
}
