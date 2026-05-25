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
) = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = "SEND_MESSAGE",
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
