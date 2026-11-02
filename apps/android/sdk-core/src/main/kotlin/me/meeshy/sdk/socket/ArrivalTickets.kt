package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.withAccountTicket
import java.util.Collections
import java.util.WeakHashMap

/** Un événement de socket et le compte sous lequel il est ARRIVÉ (#13576) ; `null` : aucun ticket posé à l'arrivée. */
class Arrived<out T>(val value: T, val ticket: AccountTicket?)

/**
 * Le ticket du compte de la trame que la voie série livre MAINTENANT : posé autour de chaque travail de
 * [OrderedDeliveryLane], lu par [SocketInboundRoute] quand il publie l'événement. Un fil de la voie, un travail à la
 * fois : le champ n'est jamais partagé entre deux trames.
 */
internal object ArrivalStamp {
    private val current = ThreadLocal<AccountTicket?>()

    fun current(): AccountTicket? = current.get()

    inline fun <R> under(ticket: AccountTicket?, block: () -> R): R {
        val previous = current()
        set(ticket)
        try {
            return block()
        } finally {
            set(previous)
        }
    }

    fun set(ticket: AccountTicket?) = current.set(ticket)
}

/**
 * Le pendant HORODATÉ d'un flux d'événements : chaque sujet de [SocketInboundRoute.subject] a sa jumelle qui porte, avec
 * l'événement, le ticket du compte sous lequel il est arrivé. Les flux exposés restent des `SharedFlow<T>` (aucun
 * consommateur ne change de type) ; [arrivals] retrouve la jumelle d'un flux exposé par [exposed].
 */
internal object ArrivalLedger {
    private val twins = Collections.synchronizedMap(WeakHashMap<Any, MutableSharedFlow<Arrived<*>>>())

    fun twinOf(subject: RouteSubject<*>): MutableSharedFlow<Arrived<*>> =
        synchronized(twins) {
            twins.getOrPut(subject) { MutableSharedFlow(replay = 0, extraBufferCapacity = Int.MAX_VALUE) }
        }

    fun register(exposed: SharedFlow<*>, subject: RouteSubject<*>) {
        twins[exposed] = twinOf(subject)
    }

    fun twin(flow: SharedFlow<*>): MutableSharedFlow<Arrived<*>>? = twins[flow]
}

/**
 * Le sujet d'une route de socket (#13584) : un flux LISIBLE qui n'expose ni `tryEmit` ni `emit` — la seule façon de
 * l'alimenter est [emitArrived], qui publie aussi sur la jumelle horodatée, et la seule façon de l'exposer est
 * [exposed]. Un `tryEmit` direct ne COMPILE plus (il perdait l'événement sans bruit pour les collecteurs
 * `collectArrived`) ; un alias, un paramètre ou un `with` n'y changent rien.
 */
class RouteSubject<T> internal constructor(
    private val flow: MutableSharedFlow<T> = MutableSharedFlow(replay = 0, extraBufferCapacity = Int.MAX_VALUE),
) : SharedFlow<T> by flow {

    init {
        ArrivalLedger.twinOf(this)
    }

    val subscriptionCount: StateFlow<Int> get() = flow.subscriptionCount

    /** Publie [value] sur le sujet ET sur sa jumelle horodatée, sous le ticket de la trame en cours de livraison. */
    internal fun emitArrived(value: T): Boolean {
        ArrivalLedger.twinOf(this).tryEmit(Arrived(value, ArrivalStamp.current()))
        return flow.tryEmit(value)
    }

    internal fun readOnly(): SharedFlow<T> = flow.asSharedFlow()
}

/** Le flux exposé au monde : lecture seule, et retrouvable par [arrivals] avec le ticket d'arrivée de chaque événement. */
fun <T> RouteSubject<T>.exposed(): SharedFlow<T> = readOnly().also { ArrivalLedger.register(it, this) }

/**
 * Les événements de ce flux avec le compte sous lequel chacun est arrivé. Un flux qui ne vient pas d'une route de socket
 * (un faux de test) rend des événements sans ticket : l'écriture retombe alors sur le compte courant, comme avant.
 */
@Suppress("UNCHECKED_CAST")
fun <T> SharedFlow<T>.arrivals(): Flow<Arrived<T>> =
    (ArrivalLedger.twin(this) as? Flow<Arrived<T>>) ?: map { Arrived(it, null) }

/**
 * Consomme chaque événement SOUS le compte auquel il est arrivé (#13576) : tout écrivain gardé que [action] appelle
 * ([me.meeshy.sdk.session.AccountFence.currentTicket]) lit ce ticket, pas celui de B qui s'est connecté pendant que
 * l'événement attendait son collecteur.
 */
suspend fun <T> SharedFlow<T>.collectArrived(action: suspend (T) -> Unit) {
    arrivals().collect { arrived -> withAccountTicket(arrived.ticket) { action(arrived.value) } }
}
