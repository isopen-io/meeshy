package me.meeshy.sdk.socket

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * La voie série des événements de socket (miroir de `MainActorDeliveryLane`, iOS).
 *
 * Un callback Socket.IO tourne sur le fil de la bibliothèque ; décoder et livrer là-bas, ou lancer une
 * coroutine par événement, n'offre aucun ordre : deux coroutines concurrentes se doublent. Ici UNE seule
 * coroutine consomme une file SANS BORNE : chaque travail s'exécute en entier, dans l'ordre exact où
 * [deliver] l'a reçu, avant le suivant — donc `message:new` puis `message:edited` s'appliquent dans cet
 * ordre, quels que soient les types. Rien n'est jamais perdu faute de place.
 *
 * Un travail qui lève est journalisé (jamais son contenu) et la voie continue.
 */
class OrderedDeliveryLane(dispatcher: CoroutineDispatcher) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val queue = Channel<() -> Unit>(Channel.UNLIMITED)

    init {
        scope.launch {
            for (work in queue) {
                try {
                    work()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.e("Socket lane: travail en echec (%s)", failure.javaClass.simpleName)
                }
            }
        }
    }

    /** Met [work] en file ; rend `false` seulement si la voie est fermée. */
    fun deliver(work: () -> Unit): Boolean = queue.trySend(work).isSuccess

    /** Ferme la voie : ce qui est en file est abandonné, la coroutine consommatrice est annulée. */
    fun close() {
        queue.close()
        scope.cancel()
    }
}
