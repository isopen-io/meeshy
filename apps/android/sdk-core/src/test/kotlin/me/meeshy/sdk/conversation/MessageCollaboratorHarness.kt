package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxRepository

/** A clock the test moves by hand. */
internal class MessageTestClock(var now: Long) : CacheClock {
    override fun nowMillis(): Long = now
}

/**
 * An in-memory Room + a real [OutboxRepository], the floor every message-collaborator test
 * stands on: collaborators are characterised against real storage, not against mocks of it.
 */
internal class MessageCollaboratorHarness(startMillis: Long = 1_700_000_000_000L) {
    val database: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()
    val outbox = OutboxRepository(database, database.outboxDao())
    val clock = MessageTestClock(startMillis)
    val updater = CachedMessageUpdater(database, database.messageDao())

    /** Stores [message] as a server-acked row, the way a sync would have. */
    suspend fun seedSynced(message: ApiMessage) {
        database.messageDao().upsertAll(listOf(MessageEntityFactory.cached(message, clock.now)))
    }

    suspend fun cachedMessage(id: String): ApiMessage =
        MeeshyApi.json.decodeFromString<ApiMessage>(database.messageDao().find(id)!!.payload)

    suspend fun cachedSendState(id: String): String? = database.messageDao().find(id)!!.sendState
}

/** Runs [block] against a fresh [MessageCollaboratorHarness] and closes its database after. */
internal fun runHarnessTest(
    startMillis: Long = 1_700_000_000_000L,
    block: suspend (MessageCollaboratorHarness) -> Unit,
) = runTest {
    val harness = MessageCollaboratorHarness(startMillis)
    try {
        block(harness)
    } finally {
        harness.database.close()
    }
}
