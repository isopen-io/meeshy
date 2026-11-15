package me.meeshy.sdk.waveform

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.waveform.WaveformContentKey
import me.meeshy.sdk.model.waveform.WaveformLocation
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/**
 * **La mesure d'une forme d'onde, une fois, partout.** Miroir de `WaveformCache` (iOS).
 *
 * RMS absolu par compartiment (voir [WaveformExtractor]), jamais divisé par le pic ; l'échelle qui
 * le rend lisible est `WaveformScale`. Le cache est clé par l'empreinte du CONTENU
 * ([WaveformContentKey]) et du nombre de compartiments : un même son sous deux noms ne se calcule
 * qu'une fois, deux `recording.m4a` ne se confondent pas. Mémoire bornée (FIFO) devant un disque
 * durable (`cacheDir`, vidé par le système au besoin).
 *
 * - **Calcul unique** : deux bulles qui demandent le même relevé en même temps partagent UNE
 *   mesure. Elle est annulée quand le dernier demandeur part (la bulle quitte l'écran) ; tant
 *   qu'il en reste un, elle continue.
 * - **Au plus [maxConcurrentMeasures] décodages à la fois** : un long fil qui défile ne monte pas
 *   dix décodeurs.
 * - Un relevé vide (fichier illisible, pas encore écrit) ne se retient pas : le prochain appel
 *   retente.
 */
class WaveformCache(
    private val directory: File,
    private val measurer: WaveformMeasuring,
    private val ioDispatcher: CoroutineDispatcher,
    memoryCapacity: Int = DEFAULT_MEMORY_CAPACITY,
    maxConcurrentMeasures: Int = DEFAULT_CONCURRENT_MEASURES,
) {

    private val scope = CoroutineScope(SupervisorJob() + ioDispatcher)
    private val gate = Semaphore(maxConcurrentMeasures)
    private val lock = Any()
    private val memory = BoundedFifoMap<String, FloatArray>(memoryCapacity)
    private val inFlight = HashMap<String, Flight>()

    private class Flight(val result: Deferred<FloatArray>) {
        var waiters = 0
    }

    /** Le relevé (RMS absolu) de l'audio à [location]. Vide si l'audio n'est pas lisible. */
    suspend fun samples(location: WaveformLocation, count: Int): List<Float> {
        if (count <= 0) return emptyList()
        val key = cacheKey(withContext(ioDispatcher) { WaveformContentKey.of(location) }, count)
        return resolve(key) { gate.withPermit { measurer.measure(location, count) } }
    }

    /** Le relevé d'un audio en mémoire (un enregistrement qui n'a pas encore de fichier). */
    suspend fun samples(data: ByteArray, count: Int): List<Float> {
        if (count <= 0) return emptyList()
        val identity = withContext(ioDispatcher) { WaveformContentKey.ofBytes(data) }
        return resolve(cacheKey(identity, count)) { measureTemporaryCopy(data, count) }
    }

    /** Vide la mémoire ; le disque reste. */
    fun clearMemoryCache() {
        synchronized(lock) { memory.clear() }
    }

    /** Vide la mémoire ET le disque : ce que la déconnexion efface, les relevés dérivant du contenu de l'ancien compte. */
    suspend fun clearAll() {
        clearMemoryCache()
        withContext(ioDispatcher) { directory.deleteRecursively() }
        clearMemoryCache()
    }

    private suspend fun resolve(key: String, measure: suspend () -> FloatArray): List<Float> {
        synchronized(lock) { memory[key] }?.let { return it.asList() }
        return join(key) { compute(key, measure) }.asList()
    }

    private suspend fun compute(key: String, measure: suspend () -> FloatArray): FloatArray {
        readFromDisk(key)?.let { return remember(key, it) }
        val measured = measure()
        if (measured.isEmpty()) return measured
        remember(key, measured)
        writeToDisk(key, measured)
        return measured
    }

    private fun remember(key: String, samples: FloatArray): FloatArray {
        synchronized(lock) { memory[key] = samples }
        return samples
    }

    /** Rejoint la mesure de [key] en cours, ou la lance. Le dernier demandeur qui part l'annule. */
    private suspend fun join(key: String, start: suspend () -> FloatArray): FloatArray {
        val flight = synchronized(lock) {
            val existing = inFlight[key]
            val current = existing ?: Flight(scope.async { start() }).also { created ->
                inFlight[key] = created
                created.result.invokeOnCompletion { synchronized(lock) { inFlight.remove(key, created) } }
            }
            current.also { it.waiters++ }
        }
        try {
            return flight.result.await()
        } finally {
            synchronized(lock) {
                flight.waiters--
                if (flight.waiters == 0) {
                    inFlight.remove(key, flight)
                    flight.result.cancel()
                }
            }
        }
    }

    private suspend fun measureTemporaryCopy(data: ByteArray, count: Int): FloatArray {
        val temporary = File(directory, "$TEMPORARY_PREFIX${UUID.randomUUID()}.bin")
        try {
            withContext(ioDispatcher) {
                directory.mkdirs()
                temporary.writeBytes(data)
            }
            return gate.withPermit { measurer.measure(WaveformLocation.Local(temporary.path), count) }
        } finally {
            temporary.delete()
        }
    }

    private suspend fun readFromDisk(key: String): FloatArray? = withContext(ioDispatcher) { readBlocking(key) }

    private suspend fun writeToDisk(key: String, samples: FloatArray) {
        withContext(ioDispatcher) { writeBlocking(key, samples) }
    }

    private fun readBlocking(key: String): FloatArray? = try {
        val file = fileFor(key)
        val bytes = if (file.isFile) file.readBytes() else ByteArray(0)
        if (bytes.isEmpty() || bytes.size % Float.SIZE_BYTES != 0) {
            null
        } else {
            FloatArray(bytes.size / Float.SIZE_BYTES).also {
                ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(it)
            }
        }
    } catch (_: IOException) {
        null
    }

    /** Écrit puis renomme : un lecteur concurrent ne voit jamais un fichier à moitié écrit. */
    private fun writeBlocking(key: String, samples: FloatArray) {
        val partial = File(directory, "$TEMPORARY_PREFIX${UUID.randomUUID()}.partial")
        try {
            directory.mkdirs()
            val bytes = ByteBuffer.allocate(samples.size * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
            bytes.asFloatBuffer().put(samples)
            partial.writeBytes(bytes.array())
            if (!partial.renameTo(fileFor(key))) partial.delete()
        } catch (_: IOException) {
            partial.delete()
        }
    }

    private fun fileFor(key: String) = File(directory, "$key.waveform")

    private fun cacheKey(identity: String, count: Int) = "${identity}_$count"

    private companion object {
        const val DEFAULT_MEMORY_CAPACITY = 300
        const val DEFAULT_CONCURRENT_MEASURES = 2
        const val TEMPORARY_PREFIX = "tmp-"
    }
}

/**
 * Dictionnaire borné à éviction FIFO (ordre d'insertion), miroir de `BoundedFIFOMap` (iOS) : mettre
 * à jour une clé existante ne change PAS son rang, l'éviction retire toujours la plus ancienne.
 * Non thread-safe : l'appelant le garde derrière un verrou.
 */
internal class BoundedFifoMap<K : Any, V : Any>(capacity: Int) {

    private val capacity = maxOf(1, capacity)
    private val storage = LinkedHashMap<K, V>()

    val size: Int get() = storage.size

    operator fun get(key: K): V? = storage[key]

    operator fun set(key: K, value: V) {
        val isNew = !storage.containsKey(key)
        storage[key] = value
        if (isNew && storage.size > capacity) storage.remove(storage.keys.first())
    }

    fun clear() {
        storage.clear()
    }
}
