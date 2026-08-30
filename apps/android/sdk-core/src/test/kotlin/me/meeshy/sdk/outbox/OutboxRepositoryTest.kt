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

    /**
     * End to end through the real enqueue: a queued write answers `true` for its own kind
     * and `false` for its lane-mate. `PreferencesSyncCoordinator` reads this to decide
     * whether folding the server's block would revert a change the user already made here,
     * so a kind that did not round-trip through the column would silently veto nothing.
     */
    @Test
    fun `hasDeliverable answers for the queued kind only`() = runTest {
        repository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_SETTINGS,
                lane = OutboxLanes.SETTINGS,
                targetId = "u1",
                payload = "{}",
                cmid = "s1",
            ),
        )

        assertThat(repository.hasDeliverable(OutboxLanes.SETTINGS, OutboxKind.UPDATE_SETTINGS)).isTrue()
        assertThat(
            repository.hasDeliverable(OutboxLanes.SETTINGS, OutboxKind.UPDATE_PRIVACY_SETTINGS),
        ).isFalse()
    }

    /** A delivered row is deleted, so nothing is owed any more. */
    @Test
    fun `hasDeliverable clears once the row is delivered`() = runTest {
        repository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_SETTINGS,
                lane = OutboxLanes.SETTINGS,
                targetId = "u1",
                payload = "{}",
                cmid = "s1",
            ),
        )

        repository.markSucceeded("s1")

        assertThat(repository.hasDeliverable(OutboxLanes.SETTINGS, OutboxKind.UPDATE_SETTINGS)).isFalse()
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

    private fun rowDependingOn(cmid: String, prereq: String, payload: String) = OutboxMutation(
        kind = OutboxKind.SEND_MESSAGE,
        lane = "lane-$cmid",
        targetId = "t-$cmid",
        payload = payload,
        dependsOn = setOf(prereq),
        cmid = cmid,
    )

    private fun rowDependingOnAll(cmid: String, prereqs: Set<String>, payload: String) = OutboxMutation(
        kind = OutboxKind.SEND_MESSAGE,
        lane = "lane-$cmid",
        targetId = "t-$cmid",
        payload = payload,
        dependsOn = prereqs,
        cmid = cmid,
    )

    private suspend fun payloadOf(cmid: String): String? =
        repository.observeAll().first().firstOrNull { it.cmid == cmid }?.payload

    @Test
    fun `rewriteDependents rewrites every pending dependent and returns the count`() = runTest {
        repository.enqueue(OutboxMutation(OutboxKind.SEND_MESSAGE, "lane-u", "t-u", "{}", cmid = "u"))
        repository.enqueue(rowDependingOn("p1", "u", "old1"))
        repository.enqueue(rowDependingOn("p2", "u", "old2"))

        val changed = repository.rewriteDependents("u") { "new:$it" }

        assertThat(changed).isEqualTo(2)
        assertThat(payloadOf("p1")).isEqualTo("new:old1")
        assertThat(payloadOf("p2")).isEqualTo("new:old2")
    }

    @Test
    fun `rewriteDependents leaves a dependent whose rewrite returns null untouched`() = runTest {
        repository.enqueue(rowDependingOn("p1", "u", "old1"))

        val changed = repository.rewriteDependents("u") { null }

        assertThat(changed).isEqualTo(0)
        assertThat(payloadOf("p1")).isEqualTo("old1")
    }

    @Test
    fun `rewriteDependents ignores rows depending on a different prerequisite`() = runTest {
        repository.enqueue(rowDependingOn("p1", "u", "old1"))
        repository.enqueue(rowDependingOn("p2", "other", "old2"))

        val changed = repository.rewriteDependents("u") { "new" }

        assertThat(changed).isEqualTo(1)
        assertThat(payloadOf("p1")).isEqualTo("new")
        assertThat(payloadOf("p2")).isEqualTo("old2")
    }

    @Test
    fun `rewriteDependents finds a dependent gated on several prerequisites by any one of them`() = runTest {
        repository.enqueue(rowDependingOnAll("p1", setOf("u", "v"), "old1"))

        assertThat(repository.rewriteDependents("u") { "via-u" }).isEqualTo(1)
        assertThat(payloadOf("p1")).isEqualTo("via-u")
        assertThat(repository.rewriteDependents("v") { "via-v" }).isEqualTo(1)
        assertThat(payloadOf("p1")).isEqualTo("via-v")
    }

    @Test
    fun `rewriteDependents does not match a prerequisite that is only a substring of a member`() = runTest {
        repository.enqueue(rowDependingOnAll("p1", setOf("upload"), "old1"))

        val changed = repository.rewriteDependents("up") { "new" }

        assertThat(changed).isEqualTo(0)
        assertThat(payloadOf("p1")).isEqualTo("old1")
    }

    @Test
    fun `rewriteDependents skips a non-pending dependent`() = runTest {
        repository.enqueue(rowDependingOn("p1", "u", "old1"))
        repository.markInflight("p1")

        val changed = repository.rewriteDependents("u") { "new" }

        assertThat(changed).isEqualTo(0)
        assertThat(payloadOf("p1")).isEqualTo("old1")
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

    @Test
    fun `activeMessageLanes discovers a per-conversation lane holding a pending send`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )

        assertThat(repository.activeMessageLanes()).containsExactly(OutboxLanes.forMessage("c1"))
    }

    @Test
    fun `activeMessageLanes discovers every distinct conversation lane, oldest lane first`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c2"), "cid_2", "{}", cmid = "m2"),
        )
        // A second message on c1's lane must not duplicate the discovered lane.
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m3"),
        )

        assertThat(repository.activeMessageLanes())
            .containsExactly(OutboxLanes.forMessage("c1"), OutboxLanes.forMessage("c2"))
    }

    @Test
    fun `activeMessageLanes omits a lane whose only row is exhausted`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )
        repository.markExhausted("m1", "gave up")

        assertThat(repository.activeMessageLanes()).isEmpty()
    }

    @Test
    fun `activeMessageLanes is empty when the queue holds only shared-lane rows`() = runTest {
        repository.enqueue(reaction(OutboxKind.ADD_REACTION, "add"))

        assertThat(repository.activeMessageLanes()).isEmpty()
    }

    @Test
    fun `deliverable of forMessage empty string never finds a real per-conversation lane`() = runTest {
        // Regression guard: OutboxFlushWorker used to discover message lanes via
        // `deliverable(OutboxLanes.forMessage(""))`, i.e. an exact-match query for the literal
        // lane "message:" — which no real row (always enqueued with a non-blank conversation id)
        // ever matches. This silently meant SEND_MESSAGE/EDIT_MESSAGE/DELETE_MESSAGE rows were
        // NEVER drained by the worker; activeMessageLanes() (a distinct-lane discovery query) is
        // the fix. This test pins the old call pattern's brokenness so nobody reintroduces it.
        repository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )

        assertThat(repository.deliverable(OutboxLanes.forMessage(""))).isEmpty()
    }
}
