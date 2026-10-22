package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.TestResult
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase

/** Runs [block] against a real [OutboxRepository] on an in-memory Room database, closed afterwards. */
internal fun withOutbox(block: suspend (OutboxRepository) -> Unit): TestResult = runTest {
    val database = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()
    try {
        block(OutboxRepository(database, database.outboxDao()))
    } finally {
        database.close()
    }
}
