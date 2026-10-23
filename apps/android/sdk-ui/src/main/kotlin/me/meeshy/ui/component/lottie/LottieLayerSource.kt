package me.meeshy.ui.component.lottie

import com.airbnb.lottie.LottieCompositionFactory
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.pack.PackAssetRef
import java.security.MessageDigest

/** D'où viennent les octets d'un fichier de pack (magasin vérifié ou réseau) ; `null` si indisponible. Couture inerte. */
public fun interface PackFileReader {
    public suspend fun read(ref: PackAssetRef): ByteArray?
}

/**
 * **D'où vient une couche Lottie** — miroir de `LottieLayerSource` (iOS). Un fichier de pack s'adresse par son contenu
 * (`<sha16>.json`) : téléchargé une fois par [reader], empreinte vérifiée (une altération ne se lit pas), décodé UNE
 * fois même sous des demandes simultanées (30 rangées au même contour partagent un seul modèle), gardé en mémoire par
 * empreinte. Fail-soft : un fichier illisible rend `null`, la couche s'efface.
 */
public class LottieLayerSource(
    private val reader: PackFileReader,
    private val decoder: (ByteArray) -> LottieFilm? = { data -> decodeFilm(data) },
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val memoryLimit: Int = MEMORY_LIMIT,
) {
    private val lock = Mutex()
    private val memory = object : LinkedHashMap<String, LottieFilm>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, LottieFilm>): Boolean = size > memoryLimit
    }
    private val running = HashMap<String, CompletableDeferred<LottieFilm?>>()

    /** Le film déjà lu d'une référence, sans attendre : une couche rouverte se monte dès sa première image. */
    public fun cached(ref: PackAssetRef): LottieFilm? = synchronized(memory) { memory[ref.sha256] }

    public suspend fun film(ref: PackAssetRef): LottieFilm? {
        cached(ref)?.let { return it }
        val (pending, owner) = lock.withLock {
            val existing = running[ref.sha256]
            if (existing != null) existing to false else CompletableDeferred<LottieFilm?>().also { running[ref.sha256] = it } to true
        }
        if (!owner) return pending.await()
        val film = try {
            load(ref)
        } catch (error: kotlinx.coroutines.CancellationException) {
            lock.withLock { running.remove(ref.sha256) }
            pending.complete(null)
            throw error
        } catch (_: Exception) {
            null
        }
        lock.withLock { running.remove(ref.sha256) }
        pending.complete(film)
        return film
    }

    private suspend fun load(ref: PackAssetRef): LottieFilm? {
        val bytes = reader.read(ref) ?: return null
        if (!sha256Hex(bytes).equals(ref.sha256, ignoreCase = true)) return null
        val film = withContext(dispatcher) { decoder(bytes) } ?: return null
        synchronized(memory) { memory[ref.sha256] = film }
        return film
    }

    public companion object {
        public const val MEMORY_LIMIT: Int = 16

        /** Le film d'un `.json` Lottie en mémoire (`null` si ce n'en est pas un). */
        public fun decodeFilm(data: ByteArray): LottieFilm? =
            runCatching { LottieCompositionFactory.fromJsonInputStreamSync(data.inputStream(), null).value }
                .getOrNull()?.let(::LottieFilm)

        internal fun sha256Hex(bytes: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
