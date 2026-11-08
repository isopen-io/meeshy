package me.meeshy.sdk.media

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import java.io.IOException
import java.util.concurrent.CopyOnWriteArrayList

/** Le transfert partagé d'une clé a été annulé (`cancel(key)`) alors que l'appelant, lui, n'a pas été annulé. */
class SharedTransferCancelledException : CancellationException("Shared media transfer cancelled")

/**
 * **Des appelants concurrents d'une même clé partagent UNE tâche** (la même note vocale chargée deux ou trois fois en
 * parallèle ne sature plus une liaison lente). Le premier appelant ouvre le transfert avec SON profil ; les suivants le
 * rejoignent, reçoivent la même progression et le même résultat.
 *
 * Quand le transfert partagé, plus restreint que la demande d'un appelant (un préchargement différé interdit de réseau
 * facturé rejoint par une lecture), échoue sur le réseau, cet appelant REPREND UNE fois avec son propre profil — par un
 * nouveau transfert, que ses pairs rejoignent à leur tour. Un média disparu ([MediaGoneException]) ne se retente pas.
 *
 * Le transfert vit dans [scope], pas dans un appelant : annuler un appelant ne tue pas ceux qui restent ; le dernier
 * appelant parti l'annule. [cancel] l'annule pour tous.
 */
class SingleFlightDownloads<T>(private val scope: CoroutineScope) {

    private class Flight<T>(val openedWith: MediaTransferProfile) {
        lateinit var job: Deferred<T>
        val listeners = CopyOnWriteArrayList<(Long, Long) -> Unit>()
        @Volatile var requested: MediaTransferProfile = openedWith
        var callers = 0
    }

    private val lock = Any()
    private val flights = HashMap<String, Flight<T>>()

    /** Le profil le plus fort demandé pour la clé en vol, ou `null`. */
    fun requestedProfile(key: String): MediaTransferProfile? = synchronized(lock) { flights[key]?.requested }

    fun isInFlight(key: String): Boolean = synchronized(lock) { flights.containsKey(key) }

    suspend fun run(
        key: String,
        profile: MediaTransferProfile,
        onProgress: (written: Long, expected: Long) -> Unit = { _, _ -> },
        transfer: suspend (profile: MediaTransferProfile, report: (Long, Long) -> Unit) -> T,
    ): T {
        var retried = false
        while (true) {
            val flight = join(key, profile, onProgress, transfer)
            try {
                return await(flight)
            } catch (failure: IOException) {
                val restricted = !flight.openedWith.covers(profile)
                if (failure is MediaGoneException || !restricted || retried) throw failure
                retried = true
            } finally {
                leave(key, flight, onProgress)
            }
        }
    }

    /** Annule le transfert de [key] pour tous ses appelants. */
    fun cancel(key: String) {
        val flight = synchronized(lock) { flights[key] } ?: return
        flight.job.cancel(SharedTransferCancelledException())
    }

    private suspend fun await(flight: Flight<T>): T {
        try {
            return flight.job.await()
        } catch (cancelled: CancellationException) {
            if (currentCoroutineContext().isActive) throw SharedTransferCancelledException()
            throw cancelled
        }
    }

    private fun join(
        key: String,
        profile: MediaTransferProfile,
        onProgress: (Long, Long) -> Unit,
        transfer: suspend (MediaTransferProfile, (Long, Long) -> Unit) -> T,
    ): Flight<T> = synchronized(lock) {
        val existing = flights[key]
        if (existing != null) {
            existing.callers++
            existing.listeners += onProgress
            existing.requested = existing.requested.merged(profile)
            return@synchronized existing
        }
        val flight = Flight<T>(profile)
        flight.callers = 1
        flight.listeners += onProgress
        flights[key] = flight
        flight.job = scope.async {
            transfer(flight.openedWith) { written, expected -> flight.listeners.forEach { it(written, expected) } }
        }
        flight.job.invokeOnCompletion {
            synchronized(lock) { if (flights[key] === flight) flights.remove(key) }
        }
        flight
    }

    private fun leave(key: String, flight: Flight<T>, onProgress: (Long, Long) -> Unit) {
        val orphaned = synchronized(lock) {
            flight.listeners -= onProgress
            flight.callers--
            flight.callers == 0 && flights[key] === flight
        }
        if (orphaned) flight.job.cancel()
    }
}
