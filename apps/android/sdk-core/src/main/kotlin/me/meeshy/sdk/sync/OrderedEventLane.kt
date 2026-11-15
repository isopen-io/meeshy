package me.meeshy.sdk.sync

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * La file ORDONNÉE du relais temps réel, une voie par [Family] (miroir de `OrderedEventLane`, iOS #11047).
 *
 * Une voie exécute ses travaux suspendus UN par UN, dans l'ordre exact de [submit] : un `message:edited`
 * soumis après son `message:new` attend que la persistance du message soit finie, il ne passe jamais
 * devant. Les familles ne s'attendent pas entre elles (un rattrapage réseau lent ne retient aucun
 * événement). SANS BORNE : rien ne se perd faute de place. [close] abandonne ce qui est en file.
 * Un travail qui lève est journalisé (la classe de l'erreur, jamais le contenu) et la voie continue.
 */
class OrderedEventLane(private val scope: CoroutineScope) {

    enum class Family { MESSAGES, CONVERSATIONS, ENRICHMENT, CATCH_UP }

    private class Entry(val work: suspend () -> Unit)

    private val lanes: Map<Family, Channel<Entry>> =
        Family.entries.associateWith { Channel<Entry>(Channel.UNLIMITED).also(::consume) }

    /** Met [work] en file sur la voie de [family] ; rend `false` si la file est fermée. */
    fun submit(family: Family, work: suspend () -> Unit): Boolean =
        scope.isActive && lanes.getValue(family).trySend(Entry(work)).isSuccess

    /** Rend la main quand tout travail soumis à [family] AVANT l'appel est terminé. */
    suspend fun barrier(family: Family) {
        val done = CompletableDeferred<Unit>()
        if (!submit(family) { done.complete(Unit) }) return
        done.await()
    }

    /** Ferme toutes les voies : ce qui est en file est jeté, plus rien ne s'accepte. */
    fun close() {
        lanes.values.forEach { it.close() }
    }

    private fun consume(queue: Channel<Entry>) {
        scope.launch {
            for (entry in queue) {
                try {
                    entry.work()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.e("Relais: travail en echec (%s)", failure.javaClass.simpleName)
                }
            }
        }
    }
}
