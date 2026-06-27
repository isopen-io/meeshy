package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var repository: OutboxRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        repository = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun reaction(kind: OutboxKind, cmid: String) = OutboxMutation(
        kind = kind,
        lane = OutboxLanes.REACTION,
        targetId = "m1:thumbsup",
        payload = "{}",
        cmid = cmid,
    )

    @Test
    fun `enqueue persists a new mutation`() = runTest {
        val cmid = repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )

        assertThat(cmid).isEqualTo("m1")
        assertThat(repository.observeAll().first().map { it.cmid }).containsExactly("m1")
    }

    @Test
    fun `enqueue annihilates a reaction toggle and emits Cancelled`() = runTest {
        repository.enqueue(reaction(OutboxKind.ADD_REACTION, "add"))

        repository.outcomes.test {
            val cmid = repository.enqueue(reaction(OutboxKind.REMOVE_REACTION, "remove"))

            assertThat(cmid).isNull()
            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Cancelled("add"))
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(repository.observeAll().first()).isEmpty()
    }

    @Test
    fun `enqueue replaces a repeated read receipt and emits Superseded`() = runTest {
        val receipt = { cmid: String ->
            OutboxMutation(OutboxKind.READ_RECEIPT, OutboxLanes.READ_RECEIPT, "c1", "{}", cmid = cmid)
        }
        repository.enqueue(receipt("first"))

        repository.outcomes.test {
            repository.enqueue(receipt("second"))
            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Superseded("first"))
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(repository.observeAll().first().map { it.cmid }).containsExactly("second")
    }

    @Test
    fun `markSucceeded deletes the row and emits Succeeded`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )

        repository.outcomes.test {
            repository.markSucceeded("m1")
            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Succeeded("m1"))
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(repository.observeAll().first()).isEmpty()
    }

    @Test
    fun `markFailed returns to pending until the attempt limit`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )

        repeat(OutboxRepository.MAX_ATTEMPTS - 1) {
            assertThat(repository.markFailed("m1")).isEqualTo(OutboxState.PENDING)
        }
        assertThat(repository.markFailed("m1")).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `markFailed at the limit emits Exhausted`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )
        repeat(OutboxRepository.MAX_ATTEMPTS - 1) { repository.markFailed("m1") }

        repository.outcomes.test {
            repository.markFailed("m1")
            assertThat(awaitItem()).isInstanceOf(OutboxOutcome.Exhausted::class.java)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `discard removes a row outright`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )

        repository.discard("m1")

        assertThat(repository.observeAll().first()).isEmpty()
    }

    @Test
    fun `discard of an unknown cmid is a no-op`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )

        repository.discard("missing")

        assertThat(repository.observeAll().first().map { it.cmid }).containsExactly("m1")
    }

    @Test
    fun `recoverInflight returns inflight rows to pending`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )
        repository.markInflight("m1")

        val recovered = repository.recoverInflight()

        assertThat(recovered).isEqualTo(1)
        assertThat(repository.deliverable(OutboxLanes.forMessage("c1")).single().stateEnum)
            .isEqualTo(OutboxState.PENDING)
    }
}
