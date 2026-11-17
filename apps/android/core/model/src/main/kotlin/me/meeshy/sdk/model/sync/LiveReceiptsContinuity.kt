package me.meeshy.sdk.model.sync

/**
 * #19049 — when a thread may send its validator under `live-receipts` (`@meeshy/shared/types/live-receipts`).
 *
 * Under that capability the gateway validates the message window WITHOUT its receipt counters (`deliveredCount`,
 * `readCount`, `recipientCount`, `deliveredToAllAt`, `readByAllAt`): a receipt alone gives a 304, and a 304 says nothing
 * of them — the socket keeps them (`read-status:updated`). That holds only while the socket hears every receipt. A thread
 * may therefore send `If-None-Match` only once it was read IN FULL (a 200, which carries the counters) during the current
 * connection: every (re)connection — what the socket said while away is lost — makes each thread read in full once
 * more, and a thread never read in full in this process reads in full. A full read whose request left before a
 * reconnection does not count for the new connection.
 *
 * What it holds is bounded by the threads read in full during the current connection.
 */
class LiveReceiptsContinuity {
    private val lock = Any()
    private var connections = 0L
    private var readInFullSince: Set<String> = emptySet()

    /** The socket connected — the first time or again. */
    fun connected() = synchronized(lock) {
        connections += 1
        readInFullSince = emptySet()
    }

    /** The connection a revalidation reads BEFORE its request, and hands back to [readInFull] after its 200. */
    fun epoch(): Long = synchronized(lock) { connections }

    fun mayRevalidateConditionally(threadId: String): Boolean = synchronized(lock) { threadId in readInFullSince }

    fun readInFull(threadId: String, epoch: Long) = synchronized(lock) {
        if (epoch == connections) readInFullSince = readInFullSince + threadId
    }
}
