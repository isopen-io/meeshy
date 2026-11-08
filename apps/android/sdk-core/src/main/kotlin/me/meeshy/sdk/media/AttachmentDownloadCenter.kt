package me.meeshy.sdk.media

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.media.AttachmentDownloadEvent
import me.meeshy.sdk.model.media.DownloadHaptic
import me.meeshy.sdk.model.media.DownloadOrigin
import me.meeshy.sdk.model.media.DownloadProgress
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import java.io.IOException

/** Les retours haptiques d'un téléchargement MANUEL ; l'app fournit le vrai moteur, le défaut est muet. */
fun interface DownloadHaptics {
    fun play(haptic: DownloadHaptic)

    companion object {
        val None: DownloadHaptics = DownloadHaptics { }
    }
}

/** Un événement du registre, rattaché à la clé de cache qu'il concerne. */
data class KeyedDownloadEvent(val key: String, val event: AttachmentDownloadEvent)

/**
 * **Le registre UNIQUE des téléchargements de médias de l'app** (miroir de `AttachmentDownloadCenter`, iOS).
 *
 * Chaque surface qui montre un média (bulle, galerie plein écran, widget audio, feed) observe le MÊME état, par CLÉ DE
 * CACHE (l'URL résolue, [key]) : une seconde demande sur une clé en cours la REJOINT au lieu d'en ouvrir une seconde ;
 * la progression, la fin, l'échec et l'annulation sont diffusés à toutes les surfaces à la fois ; une clé déjà sur
 * disque se termine SANS réseau, y compris hors ligne. Les octets passent par [MediaFetcher] (flux vers fichier, cache
 * typé borné) — jamais par la mémoire.
 *
 * Seule l'origine [DownloadOrigin.MANUAL] vibre (au départ, à la fin, à l'échec) ; [DownloadOrigin.AUTOMATIC] et le
 * préchargement restent muets. [cancelPrefetch] ne touche JAMAIS un téléchargement qu'un tap a lancé.
 */
class AttachmentDownloadCenter(
    private val fetcher: MediaFetcher,
    private val cache: TypedMediaCache,
    private val scope: CoroutineScope,
    private val keyOf: (String) -> String = { it },
    private val haptics: DownloadHaptics = DownloadHaptics.None,
) {
    private class Task(val job: Job, val generation: Long)

    private val lock = Any()
    private val tasks = HashMap<String, Task>()
    private val origins = HashMap<String, DownloadOrigin>()
    private val requestedProfiles = HashMap<String, MediaTransferProfile>()
    private val endWaiters = HashMap<String, MutableList<CompletableDeferred<AttachmentDownloadEvent?>>>()
    private var generation = 0L

    private val _active = MutableStateFlow<Map<String, DownloadProgress>>(emptyMap())

    /** Les téléchargements en cours, par clé — de quoi dessiner un anneau sans attendre un événement. */
    val active: StateFlow<Map<String, DownloadProgress>> = _active.asStateFlow()

    private val _events = MutableSharedFlow<KeyedDownloadEvent>(extraBufferCapacity = 256, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val events: SharedFlow<KeyedDownloadEvent> = _events.asSharedFlow()

    /** La clé d'un média — celle sous laquelle le cache typé le range. */
    fun key(url: String): String = keyOf(url)

    fun progress(key: String): DownloadProgress? = _active.value[key]

    /** Les événements d'une seule clé — ce qu'une façade de surface observe. */
    fun events(key: String): Flow<AttachmentDownloadEvent> = events.filter { it.key == key }.map { it.event }

    fun requestedProfile(key: String): MediaTransferProfile? = synchronized(lock) { requestedProfiles[key] }

    /** Le nombre de passes qui attendent la fin de [key]. */
    fun endWaiterCount(key: String): Int = synchronized(lock) { endWaiters[key]?.size ?: 0 }

    /** Règle SYNCHRONE « déjà sur l'appareil » : un `stat` sous la clé exacte du cache typé. */
    fun isInTypedStore(category: MediaCacheCategory, url: String): Boolean = cache.contains(category, key(url))

    /**
     * Lance le téléchargement de [url] dans le cache typé, ou rejoint celui qui tourne déjà pour la même clé. Un tap
     * ([DownloadOrigin.MANUAL]) qui rejoint un préchargement en devient le propriétaire : [cancelPrefetch] ne le touchera plus.
     */
    fun start(url: String, expectedSize: Long, category: MediaCacheCategory, origin: DownloadOrigin) {
        val key = key(url)
        val launched = launch(key, expectedSize, category, MediaTransferProfile.STANDARD, origin)
        if (launched && origin == DownloadOrigin.MANUAL) haptics.play(DownloadHaptic.LIGHT)
    }

    /**
     * Précharge [url] en SILENCE : même registre, même clé, même dédoublonnage que [start], aucun retour haptique.
     * [profile] choisit la session réseau : un préchargement lointain est différable, hors réseau facturé si le réglage
     * le demande. Une lecture ou un tap qui le rejoint le relève (escalade).
     */
    fun prefetch(
        url: String,
        expectedSize: Long,
        category: MediaCacheCategory,
        profile: MediaTransferProfile = MediaTransferProfile.STANDARD,
    ) {
        launch(key(url), expectedSize, category, profile, DownloadOrigin.AUTOMATIC)
    }

    /** Annule le téléchargement de [url] — pour TOUTES les surfaces qui le montrent. */
    fun cancel(url: String) {
        val key = key(url)
        if (!abort(key)) return
        haptics.play(DownloadHaptic.LIGHT)
    }

    /** Annule EN SILENCE un préchargement devenu inutile — jamais un téléchargement lancé par un tap. */
    fun cancelPrefetch(url: String) {
        val key = key(url)
        val manual = synchronized(lock) { origins[key] == DownloadOrigin.MANUAL }
        if (manual) return
        abort(key)
    }

    /** La fin du téléchargement de [key] (finie, échouée ou annulée), `null` si rien n'est en cours ou si l'attente est annulée. */
    suspend fun awaitEnd(key: String): AttachmentDownloadEvent? {
        val waiter = CompletableDeferred<AttachmentDownloadEvent?>()
        synchronized(lock) {
            if (!tasks.containsKey(key)) return null
            endWaiters.getOrPut(key) { mutableListOf() } += waiter
        }
        try {
            return waiter.await()
        } finally {
            synchronized(lock) {
                endWaiters[key]?.remove(waiter)
                if (endWaiters[key]?.isEmpty() == true) endWaiters.remove(key)
            }
        }
    }

    private fun abort(key: String): Boolean {
        val task = synchronized(lock) { tasks[key] } ?: return false
        task.job.cancel()
        fetcher.cancel(key)
        synchronized(lock) { origins.remove(key) }
        publish(key, AttachmentDownloadEvent.Cancelled)
        return true
    }

    private fun launch(
        key: String,
        expectedSize: Long,
        category: MediaCacheCategory,
        profile: MediaTransferProfile,
        origin: DownloadOrigin,
    ): Boolean {
        if (key.isEmpty()) return false
        val job: Job
        val gen: Long
        synchronized(lock) {
            if (tasks.containsKey(key)) {
                requestedProfiles[key] = requestedProfiles[key]?.merged(profile) ?: profile
                if (origin == DownloadOrigin.MANUAL) origins[key] = DownloadOrigin.MANUAL
                return false
            }
            gen = ++generation
            requestedProfiles[key] = profile
            origins[key] = origin
            job = scope.launch(start = CoroutineStart.LAZY) { run(key, gen, expectedSize, category, profile) }
            tasks[key] = Task(job, gen)
        }
        publish(key, AttachmentDownloadEvent.Progress(DownloadProgress(0, expectedSize)))
        job.start()
        return true
    }

    private suspend fun run(key: String, gen: Long, expectedSize: Long, category: MediaCacheCategory, profile: MediaTransferProfile) {
        try {
            if (cache.contains(category, key)) {
                finish(key, gen, cache.file(category, key)?.length() ?: expectedSize)
                return
            }
            val fetched = fetchEscalating(key, gen, category, expectedSize, profile)
            if (!fetched.persisted) fetched.file.delete()
            finish(key, gen, fetched.bytes)
        } catch (cancelled: CancellationException) {
            // `abort` a déjà publié l'annulation pour cette clé ; un transfert partagé annulé ailleurs sort en échec.
            if (cancelled is SharedTransferCancelledException && isCurrent(key, gen)) fail(key, gen, gone = false)
        } catch (gone: MediaGoneException) {
            fail(key, gen, gone = true)
        } catch (failure: Exception) {
            fail(key, gen, gone = false)
        }
    }

    /** Si le transfert ouvert avec [profile] échoue sur le réseau alors qu'une demande plus forte l'a rejoint, il reprend UNE fois. */
    private suspend fun fetchEscalating(key: String, gen: Long, category: MediaCacheCategory, expectedSize: Long, profile: MediaTransferProfile): FetchedMedia {
        val onProgress = { written: Long, expected: Long -> report(key, gen, written, expected) }
        try {
            return fetcher.fetch(category, key, expectedSize, profile, onProgress)
        } catch (failure: IOException) {
            val stronger = synchronized(lock) { requestedProfiles[key] }?.takeUnless { profile.covers(it) }
            if (failure is MediaGoneException || stronger == null) throw failure
            return fetcher.fetch(category, key, expectedSize, stronger, onProgress)
        }
    }

    private fun isCurrent(key: String, gen: Long): Boolean = synchronized(lock) { tasks[key]?.generation == gen }

    private fun finish(key: String, gen: Long, size: Long) {
        if (!isCurrent(key, gen)) return
        val origin = synchronized(lock) { origins.remove(key) }
        publish(key, AttachmentDownloadEvent.Finished(size))
        if (origin == DownloadOrigin.MANUAL) haptics.play(DownloadHaptic.SUCCESS)
    }

    private fun fail(key: String, gen: Long, gone: Boolean) {
        if (!isCurrent(key, gen)) return
        val origin = synchronized(lock) { origins.remove(key) }
        publish(key, AttachmentDownloadEvent.Failed(gone))
        if (origin == DownloadOrigin.MANUAL) haptics.play(DownloadHaptic.ERROR)
    }

    private fun report(key: String, gen: Long, written: Long, expected: Long) {
        if (!isCurrent(key, gen)) return
        val current = _active.value[key] ?: return
        publish(key, AttachmentDownloadEvent.Progress(DownloadProgress(written, if (expected > 0) expected else current.totalBytes)))
    }

    /** Point d'émission UNIQUE : met à jour l'état tenu puis diffuse. */
    private fun publish(key: String, event: AttachmentDownloadEvent) {
        val waiters: List<CompletableDeferred<AttachmentDownloadEvent?>>
        synchronized(lock) {
            if (event is AttachmentDownloadEvent.Progress) {
                _active.value = _active.value + (key to event.progress)
                waiters = emptyList()
            } else {
                _active.value = _active.value - key
                tasks.remove(key)
                requestedProfiles.remove(key)
                waiters = endWaiters.remove(key).orEmpty()
            }
        }
        waiters.forEach { it.complete(event) }
        _events.tryEmit(KeyedDownloadEvent(key, event))
    }
}
