package me.meeshy.sdk.session

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.outbox.OutboxOwnerSource
import javax.inject.Inject
import javax.inject.Singleton

/** The account a write or a send began under: who was signed in, and in which session generation. */
public data class AccountTicket(val ownerId: String?, val generation: Long)

/** The account a write or a send belonged to closed before it could land: nothing of it was kept. */
public class AccountClosedException : CancellationException("The account this write belonged to was closed")

/**
 * **The account boundary of the offline queue** (#13555). Closing an account ([close], run by [SessionTeardown.wipe])
 * opens a new generation, CANCELS every send still in flight under the old one ([guard]) and AWAITS it, waits for a
 * write already committing ([commit]), and only then wipes. Hence:
 * - a write begun under account A (its [ticket] taken when the user acted) never commits once A has closed, nor once
 *   another account is signed in — the row or blob it would have left is never written;
 * - a send under A is never still running, nor resumed, when B signs in: B's credentials never carry A's mutation.
 *
 * A guarded send must never close the account itself (it would await itself): a send that learns its session expired
 * SIGNALS it ([me.meeshy.sdk.net.SessionExpiryNotifier]), and the logout runs elsewhere.
 */
@Singleton
public class AccountFence @Inject constructor(private val owner: OutboxOwnerSource) {

    private val lock = Any()
    private var generation = 0L
    private val inFlight = LinkedHashSet<Job>()
    private val commits = Mutex()

    /** The account a write or a send beginning NOW belongs to. */
    public fun ticket(): AccountTicket = synchronized(lock) { AccountTicket(owner.currentOwnerId(), generation) }

    /** Whether [ticket]'s account is still the one signed in, in the same session generation. */
    public fun isCurrent(ticket: AccountTicket): Boolean =
        synchronized(lock) { ticket.generation == generation } && owner.currentOwnerId() == ticket.ownerId

    /** Runs [write] only while [ticket]'s account is current; a [close] waits for it. `null`: the account closed, nothing written. */
    public suspend fun <T> commit(ticket: AccountTicket, write: suspend () -> T): T? =
        commits.withLock { if (isCurrent(ticket)) write() else null }

    /**
     * Runs [work] (a send) under [ticket]'s account; a [close] cancels it and awaits its end before wiping. `null`: the
     * account closed before or during the work — it never started, or was cancelled.
     */
    public suspend fun <T> guard(ticket: AccountTicket, work: suspend () -> T): T? = coroutineScope {
        val job = async(start = CoroutineStart.LAZY) { work() }
        val admitted = synchronized(lock) { (ticket.generation == generation).also { if (it) inFlight += job } }
        if (!admitted || owner.currentOwnerId() != ticket.ownerId) {
            job.cancel(AccountClosedException())
            synchronized(lock) { inFlight -= job }
            return@coroutineScope null
        }
        try {
            job.await()
        } catch (closed: CancellationException) {
            currentCoroutineContext().ensureActive()
            null
        } finally {
            synchronized(lock) { inFlight -= job }
        }
    }

    /** Closes the current account: no write of it commits any more, its sends are cancelled and awaited, then [wipe] runs. */
    public suspend fun close(wipe: suspend () -> Unit) {
        val doomed = synchronized(lock) {
            generation += 1
            inFlight.toList()
        }
        doomed.forEach { it.cancel(AccountClosedException()) }
        doomed.joinAll()
        commits.withLock { wipe() }
    }
}
