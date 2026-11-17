package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * Audit A1 (#19047) — which refused deletions finished their settlement. The drainer marks a row EXHAUSTED BEFORE it
 * settles it ([DeleteMessageHandler.onExhausted]), and nothing else ever lifts the tombstone of the message: a process
 * that dies in between, or while the server is asked, left a possibly LIVE message « deleted » for good. A settlement
 * that finished marks its row; [RefusedDeletionReplay] settles again the exhausted deletions that carry no mark.
 */
public interface RefusedDeletionMarks {
    public suspend fun markSettled(cmid: String)

    public suspend fun isSettled(cmid: String): Boolean

    /** Forgets the marks of the rows that left the queue (collected, retried): the marks stay bounded by the queue. */
    public suspend fun keepOnly(cmids: Set<String>)

    public companion object {
        /** No disk (tests, previews): every settlement counts as finished, nothing replays. */
        public val None: RefusedDeletionMarks = object : RefusedDeletionMarks {
            override suspend fun markSettled(cmid: String) = Unit

            override suspend fun isSettled(cmid: String): Boolean = true

            override suspend fun keepOnly(cmids: Set<String>) = Unit
        }
    }
}

/** The marks, as `sync_meta` keys of their own prefix — no schema change, purged with the account's other keys. */
@Singleton
internal class SyncMetaRefusedDeletionMarks @Inject constructor(
    private val syncMetaDao: SyncMetaDao,
    private val clock: CacheClock,
) : RefusedDeletionMarks {
    override suspend fun markSettled(cmid: String) = syncMetaDao.upsert(SyncMetaEntity(PREFIX + cmid, clock.nowMillis()))

    override suspend fun isSettled(cmid: String): Boolean = syncMetaDao.lastSyncedAt(PREFIX + cmid) != null

    override suspend fun keepOnly(cmids: Set<String>) {
        syncMetaDao.keysWithPrefix(PREFIX).filterNot { it.removePrefix(PREFIX) in cmids }.forEach { syncMetaDao.delete(it) }
    }

    private companion object {
        const val PREFIX = "outbox:refused-deletion-settled:"
    }
}

/**
 * Audit A1 — at each session start, every exhausted deletion of the signed-in account whose settlement never finished
 * (no mark) is settled again, through the same [DeleteMessageHandler.onExhausted]: the message read back by its id gives
 * the live one back, or confirms the one the server no longer knows. Each settlement marks its row, so it replays once;
 * a row of another account waits for that account, and a row without an author (queued before authorship) is never
 * attributed to the one signed in.
 */
@Singleton
public class RefusedDeletionReplay @Inject constructor(
    private val outboxDao: OutboxDao,
    private val owner: OutboxOwnerSource,
    private val marks: RefusedDeletionMarks,
    private val handler: DeleteMessageHandler,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        CoroutineScope(SupervisorJob() + io).also { scope = it }.launch {
            try {
                replay()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.w(e, "Rejeu des suppressions refusées en échec")
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    /** How many settlements were replayed. */
    internal suspend fun replay(): Int {
        val exhausted = outboxDao.byKind(OutboxKind.DELETE_MESSAGE.name).filter { it.state == OutboxState.EXHAUSTED.name }
        marks.keepOnly(exhausted.mapTo(HashSet()) { it.cmid })
        val signedIn = owner.currentOwnerId() ?: return 0
        val due = exhausted.filter { it.ownerId == signedIn && !marks.isSettled(it.cmid) }
        due.forEach { handler.onExhausted(it) }
        return due.size
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class RefusedDeletionModule {
    @Binds
    abstract fun marks(impl: SyncMetaRefusedDeletionMarks): RefusedDeletionMarks

    @Binds
    @IntoSet
    abstract fun replay(binding: RefusedDeletionReplay): RealtimeBinding
}
