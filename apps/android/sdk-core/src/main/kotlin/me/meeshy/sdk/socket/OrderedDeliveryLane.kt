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
 *
 * Chaque travail porte la session ([session]) sous laquelle il a été reçu : encore en file quand cette session finit
 * (déconnexion, autre compte adopté), il est jeté au lieu d'écrire les données du compte parti sous le suivant (#13558).
 */
class OrderedDeliveryLane(dispatcher: CoroutineDispatcher, private val session: () -> Long = { 0L }) {
    private class Stamped(val session: Long, val work: () -> Unit)

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val queue = Channel<Stamped>(Channel.UNLIMITED)

    init {
        scope.launch {
            for (stamped in queue) {
                if (stamped.session != session()) continue
                try {
                    stamped.work()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.e("Socket lane: travail en echec (%s)", failure.javaClass.simpleName)
                }
            }
        }
    }

    /** Met [work] en file ; rend `false` seulement si la voie est fermée. */
    fun deliver(work: () -> Unit): Boolean = queue.trySend(Stamped(session(), work)).isSuccess

    /** Ferme la voie : ce qui est en file est abandonné, la coroutine consommatrice est annulée. */
    fun close() {
        queue.close()
        scope.cancel()
    }
}
