package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun outboxRow(
    cmid: String,
    lane: String = "message:c1",
    state: String = "PENDING",
    createdAt: Long = 0L,
    kind: String = "SEND_MESSAGE",
    targetId: String = "t",
    updatedAt: Long = createdAt,
    nextAttemptAt: Long? = null,
    ownerId: String? = null,
) = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = kind,
    targetId = targetId,
    payload = "{}",
    dependsOn = null,
    attempts = 0,
    state = state,
    createdAt = createdAt,
    updatedAt = updatedAt,
    nextAttemptAt = nextAttemptAt,
    ownerId = ownerId,
)

@RunWith(RobolectricTestRunner::class)
class OutboxDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: OutboxDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.outboxDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `observeAll orders by createdAt ascending`() = runTest {
        dao.upsert(outboxRow("b", createdAt = 200))
        dao.upsert(outboxRow("a", createdAt = 100))
        dao.upsert(outboxRow("c", createdAt = 300))

        assertThat(dao.observeAll().first().map { it.cmid }).containsExactly("a", "b", "c").inOrder()
    }

    /**
     * The question a reader asks before folding a SERVER value onto a device-local store:
     * "does this device still owe the server a write of this exact kind?". A `true` for a
     * SIBLING kind on the same lane would veto a refresh that has nothing to do with the
     * pending row — the two settings kinds share the settings lane on purpose.
     */
    @Test
    fun `hasDeliverableOfKind matches lane and kind, and ignores exhausted rows`() = runTest {
        dao.upsert(outboxRow("a", lane = "settings", kind = "UPDATE_SETTINGS", state = "PENDING"))
        dao.upsert(
            outboxRow("b", lane = "settings", kind = "UPDATE_PRIVACY_SETTINGS", state = "EXHAUSTED"),
        )
        dao.upsert(outboxRow("c", lane = "reaction", kind = "TOGGLE_REACTION", state = "PENDING"))

        assertThat(dao.hasDeliverableOfKind("settings", "UPDATE_SETTINGS")).isTrue()
        assertThat(dao.hasDeliverableOfKind("settings", "UPDATE_PRIVACY_SETTINGS")).isFalse()
        assertThat(dao.hasDeliverableOfKind("reaction", "UPDATE_SETTINGS")).isFalse()
        assertThat(dao.hasDeliverableOfKind("settings", "TOGGLE_REACTION")).isFalse()
    }

    /** An INFLIGHT row is still owed: the delivery is in the air, not confirmed. */
    @Test
    fun `hasDeliverableOfKind counts an inflight row`() = runTest {
        dao.upsert(outboxRow("a", lane = "settings", kind = "UPDATE_SETTINGS", state = "INFLIGHT"))

        assertThat(dao.hasDeliverableOfKind("settings", "UPDATE_SETTINGS")).isTrue()
    }

    @Test
    fun `deliverableForLane excludes exhausted rows and other lanes`() = runTest {
        dao.upsert(outboxRow("a", lane = "message:c1", state = "PENDING"))
        dao.upsert(outboxRow("b", lane = "message:c1", state = "EXHAUSTED"))
        dao.upsert(outboxRow("c", lane = "reaction", state = "PENDING"))

        assertThat(dao.deliverableForLane("message:c1").map { it.cmid }).containsExactly("a")
    }

    @Test
    fun `resetInflight returns inflight rows to pending`() = runTest {
        dao.upsert(outboxRow("a", state = "INFLIGHT"))
        dao.upsert(outboxRow("b", state = "INFLIGHT"))
        dao.upsert(outboxRow("c", state = "PENDING"))

        val recovered = dao.resetInflight(now = 999)

        assertThat(recovered).isEqualTo(2)
        assertThat(dao.byState("PENDING").map { it.cmid }).containsExactly("a", "b", "c")
        assertThat(dao.byState("INFLIGHT")).isEmpty()
    }

    @Test
    fun `deleteAll removes only the given rows`() = runTest {
        dao.upsert(outboxRow("a"))
        dao.upsert(outboxRow("b"))

        dao.deleteAll(listOf("a"))

        assertThat(dao.observeAll().first().map { it.cmid }).containsExactly("b")
    }

    @Test
    fun `due returns pending rows whose next attempt has come, oldest first`() = runTest {
        dao.upsert(outboxRow("never-scheduled", createdAt = 3))
        dao.upsert(outboxRow("ripe", createdAt = 1, nextAttemptAt = 100))
        dao.upsert(outboxRow("later", createdAt = 2, nextAttemptAt = 101))
        dao.upsert(outboxRow("dead", createdAt = 4, state = "EXHAUSTED"))
        dao.upsert(outboxRow("flying", createdAt = 5, state = "INFLIGHT"))

        assertThat(dao.due(now = 100).map { it.cmid }).containsExactly("ripe", "never-scheduled").inOrder()
    }

    @Test
    fun `reclaimStaleInflight frees only rows in flight for longer than the cutoff`() = runTest {
        dao.upsert(outboxRow("stale", state = "INFLIGHT", updatedAt = 10))
        dao.upsert(outboxRow("fresh", state = "INFLIGHT", updatedAt = 900))

        val reclaimed = dao.reclaimStaleInflight(staleBefore = 500, now = 1_000)

        assertThat(reclaimed).isEqualTo(1)
        assertThat(dao.byState("PENDING").map { it.cmid }).containsExactly("stale")
        assertThat(dao.byState("INFLIGHT").map { it.cmid }).containsExactly("fresh")
    }

    @Test
    fun `activeCount skips exhausted rows and the excluded kinds`() = runTest {
        dao.upsert(outboxRow("a", kind = "SEND_MESSAGE"))
        dao.upsert(outboxRow("b", kind = "READ_RECEIPT"))
        dao.upsert(outboxRow("c", kind = "ADD_REACTION", state = "INFLIGHT"))
        dao.upsert(outboxRow("d", kind = "SEND_MESSAGE", state = "EXHAUSTED"))

        assertThat(dao.activeCount(listOf("READ_RECEIPT"))).isEqualTo(2)
        assertThat(dao.observeActiveCount(listOf("READ_RECEIPT")).first()).isEqualTo(2)
        assertThat(dao.activeCount(emptyList())).isEqualTo(3)
    }

    @Test
    fun `observeTop caps the head of the queue and leaves out excluded kinds`() = runTest {
        (1..60).forEach { dao.upsert(outboxRow("r$it", createdAt = it.toLong())) }
        dao.upsert(outboxRow("receipt", createdAt = 0, kind = "READ_RECEIPT"))

        val top = dao.observeTop(listOf("READ_RECEIPT"), limit = 50).first()

        assertThat(top).hasSize(50)
        assertThat(top.first().cmid).isEqualTo("r1")
        assertThat(top.map { it.cmid }).doesNotContain("receipt")
    }

    @Test
    fun `exhaustedOlderThan returns only terminal rows that gave up before the cutoff`() = runTest {
        dao.upsert(outboxRow("old", state = "EXHAUSTED", updatedAt = 10))
        dao.upsert(outboxRow("recent", state = "EXHAUSTED", updatedAt = 900))
        dao.upsert(outboxRow("alive", state = "PENDING", updatedAt = 10))

        assertThat(dao.exhaustedOlderThan(cutoff = 500).map { it.cmid }).containsExactly("old")
    }

    @Test
    fun `hasUnsentRow is true for a queued or in-flight row on the anchor, false once exhausted`() = runTest {
        dao.upsert(outboxRow("a", kind = "LIKE_POST", targetId = "p1"))
        dao.upsert(outboxRow("b", kind = "LIKE_POST", targetId = "p2", state = "EXHAUSTED"))
        dao.upsert(outboxRow("c", kind = "UNLIKE_POST", targetId = "p3", state = "INFLIGHT"))

        assertThat(dao.hasUnsentRow("LIKE_POST", "p1")).isTrue()
        assertThat(dao.hasUnsentRow("LIKE_POST", "p2")).isFalse()
        assertThat(dao.hasUnsentRow("UNLIKE_POST", "p3")).isTrue()
        assertThat(dao.hasUnsentRow("LIKE_POST", "p3")).isFalse()
    }

    @Test
    fun `byOwner lists only the rows of that account`() = runTest {
        dao.upsert(outboxRow("a1", createdAt = 2, ownerId = "A"))
        dao.upsert(outboxRow("b1", createdAt = 1, ownerId = "B"))
        dao.upsert(outboxRow("a0", createdAt = 1, ownerId = "A"))
        dao.upsert(outboxRow("none"))

        assertThat(dao.byOwner("A").map { it.cmid }).containsExactly("a0", "a1").inOrder()
    }

    @Test
    fun `defer reschedules a row without charging an attempt and claimIfOwnerless never steals`() = runTest {
        dao.upsert(outboxRow("a"))
        dao.upsert(outboxRow("b", ownerId = "A"))

        dao.defer("a", nextAttemptAt = 500, waitingSince = 100, now = 200)
        dao.claimIfOwnerless("a", "B", now = 300)
        dao.claimIfOwnerless("b", "B", now = 300)

        val a = dao.find("a")!!
        assertThat(a.attempts).isEqualTo(0)
        assertThat(a.nextAttemptAt).isEqualTo(500)
        assertThat(a.waitingSince).isEqualTo(100)
        assertThat(a.ownerId).isEqualTo("B")
        assertThat(dao.find("b")!!.ownerId).isEqualTo("A")
    }
}
