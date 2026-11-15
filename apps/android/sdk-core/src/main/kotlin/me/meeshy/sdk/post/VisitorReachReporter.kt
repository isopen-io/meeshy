package me.meeshy.sdk.post

import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.VisitorReachQueue
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.StampedSocialEvent

/** L'issue d'un envoi : ce que la passerelle a dit, rien de plus. */
enum class VisitorReachDelivery { ACKNOWLEDGED, REFUSED_PERMANENTLY, FAILED }

/** Envoie un lot sous le jeton donne (`X-Session-Token`). */
fun interface VisitorReachSender {
    suspend fun send(events: List<StampedSocialEvent>, token: String): VisitorReachDelivery
}

/** Le disque de la file : une seule chaine JSON, `null` = rien. */
interface VisitorReachStorage {
    fun read(): String?
    fun write(json: String?)
}

/**
 * Envoie les impressions, vues et ouvertures d'un lecteur SANS compte par `POST /social/events`
 * sous son jeton (miroir de `VisitorReachReporter` iOS, #10483).
 *
 * - groupement 2 s apres le premier evenement, vidage au retour du reseau et au retour au premier
 *   plan ([start]) ;
 * - la file est persistante (plafond 500) et rejouee au lancement suivant ; un evenement n'en sort
 *   qu'a l'ACQUITTEMENT du serveur ou a un refus definitif (le rejouer ne ferait que se faire refuser) ;
 * - l'identite d'un evenement est une empreinte de la cle, jamais la cle ; un jeton qui n'est plus
 *   detenu (cle purgee par une connexion) emporte les evenements qu'il avait vus ;
 * - aucun envoi pour un utilisateur connecte.
 */
class VisitorReachReporter(
    private val sender: VisitorReachSender,
    private val storage: VisitorReachStorage,
    private val token: () -> String,
    private val knownTokens: () -> List<String>,
    private val isSignedIn: () -> Boolean,
    private val scope: CoroutineScope,
    private val flushDelayMillis: Long = FLUSH_DELAY_MILLIS,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val newEventId: () -> String = { me.meeshy.sdk.model.analytics.SocialEventStamp.newEventId() },
) {
    private val queue = AtomicReference(VisitorReachQueue.restore(storage.read()))
    private val flushLock = Mutex()
    private val scheduled = AtomicReference<Job?>(null)

    init {
        if (!queue.get().isEmpty) scheduleFlush()
    }

    val pendingCount: Int get() = queue.get().entries.size

    /** Branche les declencheurs de vidage : retour du reseau et retour au premier plan. */
    fun start(reconnects: Flow<Unit>, foreground: Flow<Unit>) {
        listOf(reconnects, foreground).forEach { trigger ->
            scope.launch {
                try {
                    trigger.collect { flushNow() }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // un declencheur defaillant ne doit pas emporter l'autre
                }
            }
        }
    }

    fun record(events: List<SocialEvent>) {
        if (events.isEmpty() || isSignedIn()) return
        val identity = VisitorReachQueue.identityOf(token())
        val now = nowMillis()
        val stamped = events.map { StampedSocialEvent.stamping(it, now, newEventId) }
        val next = queue.updateAndGet { it.append(stamped, identity) }
        storage.write(if (next.isEmpty) null else next.toJson())
        scheduleFlush()
    }

    suspend fun flushNow() {
        scheduled.getAndSet(null)?.cancel()
        flush()
    }

    private fun scheduleFlush() {
        val job = scope.launch {
            delay(flushDelayMillis)
            flush()
        }
        scheduled.getAndSet(job)?.cancel()
    }

    private suspend fun flush() = flushLock.withLock {
        if (isSignedIn()) return
        val snapshot = queue.get()
        if (snapshot.isEmpty) return
        val tokensByIdentity = knownTokens().associateBy { VisitorReachQueue.identityOf(it) }
        for (group in snapshot.requests()) {
            val groupToken = tokensByIdentity[group.first().identity]
            val delivery = if (groupToken == null) {
                VisitorReachDelivery.REFUSED_PERMANENTLY
            } else {
                try {
                    sender.send(group.map { it.stamped }, groupToken)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    VisitorReachDelivery.FAILED
                }
            }
            if (delivery == VisitorReachDelivery.FAILED) continue
            val ids = group.map { it.stamped.stamp.eventId }.toSet()
            val next = queue.updateAndGet { it.acknowledge(ids) }
            storage.write(if (next.isEmpty) null else next.toJson())
        }
    }

    companion object {
        const val FLUSH_DELAY_MILLIS: Long = 2_000L
    }
}
