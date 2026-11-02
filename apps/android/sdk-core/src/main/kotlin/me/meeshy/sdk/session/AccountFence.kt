package me.meeshy.sdk.session

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.outbox.OutboxOwnerSource
import javax.inject.Inject
import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext
import javax.inject.Singleton

/**
 * The account a write or a send began under: who was signed in, in which fence generation, and in which session
 * ([SessionTransitionFlags.generation], which moves the moment a session ends or another account is adopted).
 */
public data class AccountTicket(val ownerId: String?, val generation: Long, val session: Long = 0L)

/**
 * The ticket the work running in this coroutine belongs to (#13558): installed at the user's GESTURE
 * ([withAccountTicket]) or by a guarded send ([AccountFence.guard]), it is the one every fenced write below picks up
 * ([AccountFence.currentTicket]) — the copy, retouch or compression that runs before a media is queued no longer
 * re-reads "whoever is signed in now".
 */
public class AccountTicketContext(public val ticket: AccountTicket) : AbstractCoroutineContextElement(Key) {
    public companion object Key : CoroutineContext.Key<AccountTicketContext>
}

/** The context that carries [this] ticket into a `launch` started at the gesture; empty for an unfenced (`null`) ticket. */
public fun AccountTicket?.asCoroutineContext(): CoroutineContext = this?.let(::AccountTicketContext) ?: EmptyCoroutineContext

/** Runs [block] under [ticket]'s account (taken at the gesture); `null` leaves the ambient ticket as it is. */
public suspend fun <T> withAccountTicket(ticket: AccountTicket?, block: suspend CoroutineScope.() -> T): T =
    if (ticket == null) coroutineScope(block) else withContext(AccountTicketContext(ticket), block)

/**
 * [write] under [ticket] when both a fence and a ticket exist, unconditionally otherwise (an unfenced test or tool).
 * `null`: the account closed before the write could land — nothing was written.
 */
public suspend fun <T> AccountFence?.commitOrWrite(ticket: AccountTicket?, write: suspend () -> T): T? =
    if (this == null || ticket == null) write() else commit(ticket, write)

/** The account a write or a send belonged to closed before it could land: nothing of it was kept. */
public class AccountClosedException : CancellationException("The account this write belonged to was closed")

/**
 * **The account boundary of every per-account write** (#13555, #13558). Closing an account ([close], run by
 * [SessionTeardown.wipe]) opens a new generation, CANCELS every send still in flight under the old one ([guard]) and
 * AWAITS it, waits for the writes already committing ([commit]), and only then wipes. Hence:
 * - a write begun under account A (its [ticket] taken when the user acted, or when the request that feeds it left)
 *   never commits once A has closed, nor once another session is open — the row it would have left is never written;
 * - a send under A is never still running, nor resumed, when B signs in: B's credentials never carry A's mutation;
 * - an account adopted over a live one without a wipe ([revoke]) cancels the sends of the previous one as well.
 *
 * Writes of the same account do not queue behind each other: [commit] only counts them, so a nested commit, or two
 * repositories writing at once, never wait on one another. A write whose ticket was taken DURING a wipe waits for the
 * wipe to end, then lands if its account is still current.
 *
 * A guarded send must never close the account itself (it would await itself): a send that learns its session expired
 * SIGNALS it ([me.meeshy.sdk.net.SessionExpiryNotifier]), and the logout runs elsewhere.
 */
@Singleton
public class AccountFence @Inject constructor(
    private val owner: OutboxOwnerSource,
    private val transition: SessionTransitionFlags,
) {
    public constructor(owner: OutboxOwnerSource) : this(owner, SessionTransitionFlags())

    private val lock = Any()
    private var generation = 0L
    private val inFlight = LinkedHashSet<Job>()
    private var writers = 0
    private var drained: CompletableDeferred<Unit>? = null
    private var wiping: CompletableDeferred<Unit>? = null
    private val closes = Mutex()

    /** The account a write or a send beginning NOW belongs to. */
    public fun ticket(): AccountTicket =
        synchronized(lock) { AccountTicket(owner.currentOwnerId(), generation, transition.generation) }

    /** The ticket of the work running here ([AccountTicketContext]) when one was installed, else [ticket]. */
    public suspend fun currentTicket(): AccountTicket = currentCoroutineContext()[AccountTicketContext]?.ticket ?: ticket()

    /** Whether [ticket]'s account is still the one signed in, in the same fence generation and the same session. */
    public fun isCurrent(ticket: AccountTicket): Boolean = synchronized(lock) { currentLocked(ticket) }

    private fun currentLocked(ticket: AccountTicket): Boolean =
        ticket.generation == generation && ticket.session == transition.generation && owner.currentOwnerId() == ticket.ownerId

    /** Runs [write] only while [ticket]'s account is current; a [close] waits for it. `null`: the account closed, nothing written. */
    public suspend fun <T> commit(ticket: AccountTicket, write: suspend () -> T): T? {
        if (!admitWriter(ticket)) return null
        try {
            return write()
        } finally {
            synchronized(lock) {
                writers -= 1
                if (writers == 0) drained?.complete(Unit)
            }
        }
    }

    private suspend fun admitWriter(ticket: AccountTicket): Boolean {
        while (true) {
            val wipe = synchronized(lock) {
                if (!currentLocked(ticket)) return false
                val pending = wiping
                if (pending == null) writers += 1
                pending
            } ?: return true
            wipe.await()
        }
    }

    /**
     * Runs [work] (a send) under [ticket]'s account; a [close] or a [revoke] cancels it (a close awaits its end before
     * wiping). `null`: the account closed before or during the work — it never started, or was cancelled.
     */
    public suspend fun <T> guard(ticket: AccountTicket, work: suspend () -> T): T? = coroutineScope {
        val job = async(AccountTicketContext(ticket), start = CoroutineStart.LAZY) { work() }
        val admitted = synchronized(lock) { currentLocked(ticket).also { if (it) inFlight += job } }
        if (!admitted) {
            job.cancel(AccountClosedException())
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

    /**
     * Another account was adopted over a live one, without a wipe: every ticket taken so far is retired and every send
     * in flight is cancelled (not awaited — the caller cannot suspend), so its next request never leaves under the
     * credentials of the account just adopted.
     */
    public fun revoke() {
        val doomed = synchronized(lock) {
            generation += 1
            inFlight.toList()
        }
        doomed.forEach { it.cancel(AccountClosedException()) }
    }

    /** Closes the current account: no write of it commits any more, its sends are cancelled and awaited, then [wipe] runs. */
    public suspend fun close(wipe: suspend () -> Unit) {
        closes.withLock {
            val wiped = CompletableDeferred<Unit>()
            val (doomed, drain) = synchronized(lock) {
                generation += 1
                wiping = wiped
                val waitWriters = if (writers > 0) CompletableDeferred<Unit>().also { drained = it } else null
                inFlight.toList() to waitWriters
            }
            try {
                doomed.forEach { it.cancel(AccountClosedException()) }
                doomed.joinAll()
                drain?.await()
                wipe()
            } finally {
                synchronized(lock) {
                    wiping = null
                    drained = null
                }
                wiped.complete(Unit)
            }
        }
    }
}
