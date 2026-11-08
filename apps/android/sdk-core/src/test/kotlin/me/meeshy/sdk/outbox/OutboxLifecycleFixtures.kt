package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.TestResult
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.OutboxEntity

/** Une ligne d'outbox écrite telle quelle, hors coalescence. */
internal fun outboxRow(
    cmid: String,
    kind: OutboxKind = OutboxKind.ADD_REACTION,
    lane: String = OutboxLanes.REACTION,
    targetId: String = "t-$cmid",
    state: OutboxState = OutboxState.PENDING,
    updatedAt: Long = 1_000L,
    ownerId: String? = "A",
    dependsOn: String? = null,
    lastError: String? = null,
) = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = kind.name,
    targetId = targetId,
    payload = "{}",
    dependsOn = dependsOn,
    attempts = 0,
    state = state.name,
    createdAt = updatedAt,
    updatedAt = updatedAt,
    lastError = lastError,
    ownerId = ownerId,
)

/** Une base en mémoire et un dépôt dont le compte connecté est [signedIn]. */
internal fun withOwnedOutbox(
    signedIn: () -> String? = { "A" },
    block: suspend (OutboxRepository, MeeshyDatabase) -> Unit,
): TestResult = runTest {
    val database = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()
    try {
        block(OutboxRepository(database, database.outboxDao(), { signedIn() }), database)
    } finally {
        database.close()
    }
}
