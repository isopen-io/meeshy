package me.meeshy.sdk.model.sync

import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext

/**
 * #18927 — ONE pass of [work] at a time, shared by every caller, in a job of its own.
 *
 * - [join]: a caller that arrives while a pass flies joins it instead of starting a second one.
 * - [catchUp]: events were missed (a reconnection) and a pass already flying was built before them, so joining it would
 *   lose them: exactly ONE more pass is queued behind it, started once it settles, and shared by every catch-up asked
 *   meanwhile.
 * - A caller cancelled while it waits (the stream's `transformLatest`) leaves the pass running: the work is shared, never
 *   owned by one waiter. Its failure reaches every caller that awaits it; once settled, the next call starts anew.
 *
 * A pass keeps the context of the caller that asked for it (dispatcher, account ticket), minus its job.
 */
class SharedPass(private val work: suspend () -> Unit) {
    private val lock = Any()
    private var running: Deferred<Unit>? = null
    private var queued: Deferred<Unit>? = null

    suspend fun join() = await(catchUp = false)

    suspend fun catchUp() = await(catchUp = true)

    /** No pass running nor queued: a [KeyedSharedPass] may drop this lane. */
    val isIdle: Boolean
        get() = synchronized(lock) { running?.isCompleted != false && queued?.isCompleted != false }

    private suspend fun await(catchUp: Boolean) {
        val context = currentCoroutineContext().minusKey(Job)
        val pass = synchronized(lock) {
            val current = running?.takeUnless { it.isCompleted }
            when {
                current == null -> newPass(context, after = null).also { running = it }
                !catchUp -> current
                else -> queued?.takeUnless { it.isCompleted } ?: newPass(context, after = current).also { queued = it }
            }
        }
        pass.await()
    }

    private fun newPass(context: CoroutineContext, after: Deferred<Unit>?): Deferred<Unit> {
        lateinit var pass: Deferred<Unit>
        pass = CoroutineScope(context + SupervisorJob()).async(start = CoroutineStart.LAZY) {
            if (after != null) {
                after.join()
                synchronized(lock) {
                    if (queued === pass) queued = null
                    running = pass
                }
            }
            work()
        }
        pass.invokeOnCompletion {
            synchronized(lock) {
                if (running === pass) running = null
                if (queued === pass) queued = null
            }
        }
        return pass
    }
}
