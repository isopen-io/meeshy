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
) = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = kind,
    targetId = "t",
    payload = "{}",
    dependsOn = null,
    attempts = 0,
    state = state,
    createdAt = createdAt,
    updatedAt = createdAt,
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
}
