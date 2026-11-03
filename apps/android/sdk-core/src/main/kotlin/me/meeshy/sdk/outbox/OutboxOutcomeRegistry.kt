package me.meeshy.sdk.outbox

/**
 * Registre des issues terminales d'une mutation outbox (miroir d'iOS `OutboxOutcomeRegistry`) : les observateurs en
 * attente, clés par jeton de souscription, et les tombstones des issues déjà publiées (FIFO borné).
 *
 * Un `SharedFlow` sans replay perdait l'issue d'un abonné tardif (l'attente éternelle) ; ici un abonné qui arrive après la
 * livraison reçoit l'issue mémorisée. Un observateur annulé ne retire QUE son propre jeton : les autres observateurs du
 * même `cmid` restent servis.
 *
 * Tous les accès sont sérialisés par le verrou du registre ; les observateurs sont appelés HORS verrou.
 */
internal class OutboxOutcomeRegistry(private val tombstoneCapacity: Int = TOMBSTONE_CAPACITY) {

    /** Ce que rend une souscription : l'issue déjà publiée, ou un jeton à rendre à [drop]. */
    sealed interface Subscription {
        data class Fired(val outcome: OutboxOutcome) : Subscription
        data class Registered(val token: Long) : Subscription
    }

    /** Un observateur : [onOutcome] reçoit l'issue puis le flux se termine ; [onEnd] termine sans issue. */
    class Observer(val onOutcome: (OutboxOutcome) -> Unit, val onEnd: () -> Unit)

    private val lock = Any()
    private val observers = HashMap<String, LinkedHashMap<Long, Observer>>()
    private val tombstones = object : LinkedHashMap<String, OutboxOutcome>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, OutboxOutcome>?): Boolean =
            size > tombstoneCapacity
    }
    private var nextToken = 0L

    fun firedOutcome(cmid: String): OutboxOutcome? = synchronized(lock) { tombstones[cmid] }

    /** Atomique : l'issue mémorisée si elle existe, sinon l'observateur est inscrit sous un nouveau jeton. */
    fun subscribe(cmid: String, observer: Observer): Subscription = synchronized(lock) {
        tombstones[cmid]?.let { return@synchronized Subscription.Fired(it) }
        val token = nextToken++
        observers.getOrPut(cmid) { LinkedHashMap() }[token] = observer
        Subscription.Registered(token)
    }

    /** Retire la seule inscription [token] ; idempotent, ne touche pas aux autres observateurs de [cmid]. */
    fun drop(cmid: String, token: Long) {
        synchronized(lock) {
            val slot = observers[cmid] ?: return
            slot.remove(token)
            if (slot.isEmpty()) observers.remove(cmid)
        }
    }

    /** Mémorise l'issue puis la remet à chaque observateur de son `cmid`, dont les flux se terminent. */
    fun publish(outcome: OutboxOutcome) {
        val served = synchronized(lock) {
            tombstones.remove(outcome.cmid)
            tombstones[outcome.cmid] = outcome
            observers.remove(outcome.cmid)?.values?.toList().orEmpty()
        }
        served.forEach { it.onOutcome(outcome) }
    }

    /** Oublie l'issue mémorisée d'un identifiant que l'on vient de réarmer (un abonné ne reçoit pas l'échec périmé). */
    fun forget(cmid: String) {
        synchronized(lock) { tombstones.remove(cmid) }
    }

    /** Termine, SANS issue, les observateurs d'une mutation qui n'en aura jamais (annulée, retirée par l'utilisateur). */
    fun end(cmid: String) {
        val ended = synchronized(lock) { observers.remove(cmid)?.values?.toList().orEmpty() }
        ended.forEach { it.onEnd() }
    }

    /** Wipe complet (déconnexion) : aucune issue d'une session ne se rejoue dans la suivante. */
    fun reset() {
        val ended = synchronized(lock) {
            tombstones.clear()
            observers.values.flatMap { it.values }.also { observers.clear() }
        }
        ended.forEach { it.onEnd() }
    }

    /** Nombre de mutations encore observées — témoin de la purge. */
    val observedCount: Int get() = synchronized(lock) { observers.size }

    val tombstoneCount: Int get() = synchronized(lock) { tombstones.size }

    companion object {
        const val TOMBSTONE_CAPACITY: Int = 200
    }
}
