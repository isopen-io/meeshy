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

    // region id local retenu (#11609)

    private val localStory = "pending_550e8400-e29b-41d4-a716-446655440000"
    private val serverStory = "507f1f77bcf86cd799439011"

    private fun like(cmid: String, targetId: String, kind: OutboxKind = OutboxKind.LIKE_POST) = OutboxMutation(
        kind = kind,
        lane = OutboxLanes.SOCIAL,
        targetId = targetId,
        payload = "{}",
        cmid = cmid,
    )

    @Test
    fun `a mutation addressed to a local id is held out of the drainer's reach`() = runTest {
        repository.enqueue(like("l1", localStory))

        assertThat(repository.deliverable(OutboxLanes.SOCIAL)).isEmpty()
    }

    @Test
    fun `a held mutation keeps its full attempt budget and stays pending`() = runTest {
        repository.enqueue(like("l1", localStory))

        val row = repository.observeAll().first().single()

        assertThat(row.attempts).isEqualTo(0)
        assertThat(row.stateEnum).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `a held mutation is still owed to the server`() = runTest {
        repository.enqueue(like("l1", localStory))

        assertThat(repository.hasDeliverable(OutboxLanes.SOCIAL, OutboxKind.LIKE_POST)).isTrue()
    }

    @Test
    fun `a mutation addressed to a server id is deliverable at once`() = runTest {
        repository.enqueue(like("l1", serverStory))

        assertThat(repository.deliverable(OutboxLanes.SOCIAL).map { it.cmid }).containsExactly("l1")
    }

    @Test
    fun `a held mutation does not hide its deliverable lane-mates`() = runTest {
        repository.enqueue(like("held", localStory))
        repository.enqueue(like("ready", serverStory, OutboxKind.BOOKMARK_POST))

        assertThat(repository.deliverable(OutboxLanes.SOCIAL).map { it.cmid }).containsExactly("ready")
    }

    @Test
    fun `a story publish keeps draining although its target is a pending id`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.PUBLISH_STORY, OutboxLanes.STORY, localStory, "{}", cmid = "p1"),
        )

        assertThat(repository.deliverable(OutboxLanes.STORY).map { it.cmid }).containsExactly("p1")
    }

    @Test
    fun `a held like and unlike of the same pending story still annihilate`() = runTest {
        repository.enqueue(like("l1", localStory))

        val cmid = repository.enqueue(like("l2", localStory, OutboxKind.UNLIKE_POST))

        assertThat(cmid).isNull()
        assertThat(repository.observeAll().first()).isEmpty()
    }

    @Test
    fun `resolveLocalId re-addresses the waiting rows to the server id`() = runTest {
        repository.enqueue(like("l1", localStory))

        val changed = repository.resolveLocalId(localStory, serverStory)

        assertThat(changed).isEqualTo(1)
        val ready = repository.deliverable(OutboxLanes.SOCIAL).single()
        assertThat(ready.cmid).isEqualTo("l1")
        assertThat(ready.targetId).isEqualTo(serverStory)
        assertThat(ready.attempts).isEqualTo(0)
    }

    @Test
    fun `resolveLocalId leaves the rows of another local id waiting`() = runTest {
        repository.enqueue(like("l1", localStory))
        repository.enqueue(like("l2", "pending_other", OutboxKind.BOOKMARK_POST))

        repository.resolveLocalId(localStory, serverStory)

        assertThat(repository.deliverable(OutboxLanes.SOCIAL).map { it.cmid }).containsExactly("l1")
    }

    @Test
    fun `resolveLocalId refuses a server id that is not an object id`() = runTest {
        repository.enqueue(like("l1", localStory))

        assertThat(repository.resolveLocalId(localStory, "pending_elsewhere")).isEqualTo(0)
        assertThat(repository.resolveLocalId(localStory, "")).isEqualTo(0)
        assertThat(repository.deliverable(OutboxLanes.SOCIAL)).isEmpty()
    }

    @Test
    fun `resolveLocalId refuses an id that was never local`() = runTest {
        repository.enqueue(like("l1", serverStory))

        assertThat(repository.resolveLocalId(serverStory, "507f1f77bcf86cd799439022")).isEqualTo(0)
        assertThat(repository.deliverable(OutboxLanes.SOCIAL).single().targetId).isEqualTo(serverStory)
    }

    @Test
    fun `resolveLocalId does not revive an exhausted row`() = runTest {
        repository.enqueue(like("l1", localStory))
        repository.markExhausted("l1", "gave up")

        assertThat(repository.resolveLocalId(localStory, serverStory)).isEqualTo(0)
        assertThat(repository.deliverable(OutboxLanes.SOCIAL)).isEmpty()
    }

    @Test
    fun `cancelHeldFor drops the waiting rows and signals Cancelled`() = runTest {
        repository.enqueue(like("l1", localStory))
        repository.enqueue(like("l2", serverStory, OutboxKind.BOOKMARK_POST))

        repository.outcomes.test {
            val cancelled = repository.cancelHeldFor(localStory)

            assertThat(cancelled).isEqualTo(1)
            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Cancelled("l1"))
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(repository.observeAll().first().map { it.cmid }).containsExactly("l2")
    }

    @Test
    fun `cancelHeldFor leaves a story publish that shares the pending id`() = runTest {
        repository.enqueue(
            OutboxMutation(OutboxKind.PUBLISH_STORY, OutboxLanes.STORY, localStory, "{}", cmid = "p1"),
        )

        assertThat(repository.cancelHeldFor(localStory)).isEqualTo(0)
        assertThat(repository.observeAll().first().map { it.cmid }).containsExactly("p1")
    }

    // endregion
}
