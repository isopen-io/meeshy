package me.meeshy.sdk.socket

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * La file ORDONNÉE des événements qui mutent un fil, une voie par conversation (miroir de
 * `OrderedEventLane`, iOS #11047).
 *
 * Chaque voie exécute ses travaux suspendus UN par UN, dans l'ordre exact de [submit] : un
 * enrichissement soumis après son `message:new` attend que le travail du message soit fini (la ligne
 * en Room), jamais il ne passe devant. Deux conversations ne s'attendent pas : chacune a sa voie.
 *
 * La file est SANS BORNE (rien ne se perd faute de place) et vit dans [scope] : l'annuler ferme
 * toutes les voies. Un travail qui lève est journalisé (la classe de l'erreur, jamais le contenu) et
 * la voie continue.
 */
class OrderedEventLane(private val scope: CoroutineScope) {
    private val lanes = mutableMapOf<String, Channel<suspend () -> Unit>>()

    /** Met [work] en file sur la voie de [key] ; rend `false` si la file est fermée. */
    fun submit(key: String, work: suspend () -> Unit): Boolean = laneFor(key).trySend(work).isSuccess

    /** Rend la main quand tout travail soumis à [key] AVANT l'appel est terminé (barrière des tests). */
    suspend fun barrier(key: String) {
        val done = CompletableDeferred<Unit>()
        if (!submit(key) { done.complete(Unit) }) return
        done.await()
    }

    private fun laneFor(key: String): Channel<suspend () -> Unit> = synchronized(lanes) {
        lanes.getOrPut(key) { Channel<suspend () -> Unit>(Channel.UNLIMITED).also { consume(it) } }
    }

    private fun consume(queue: Channel<suspend () -> Unit>) {
        val job = scope.launch {
            for (work in queue) {
                try {
                    work()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.e("Event lane: travail en echec (%s)", failure.javaClass.simpleName)
                }
            }
        }
        job.invokeOnCompletion { queue.close() }
    }
}
