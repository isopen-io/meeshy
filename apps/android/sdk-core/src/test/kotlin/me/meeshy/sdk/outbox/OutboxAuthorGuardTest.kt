package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
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
class OutboxAuthorGuardTest {

    private lateinit var db: MeeshyDatabase
    private var signedIn: String? = "A"
    private lateinit var outbox: OutboxRepository
    private val sent = mutableListOf<String>()
    private val lane = OutboxLanes.REACTION

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        outbox = OutboxRepository(db, db.outboxDao()) { signedIn }
    }

    @After
    fun tearDown() = db.close()

    private fun drainer() = OutboxDrainer(
        outbox,
        mapOf(OutboxKind.ADD_REACTION to MutationSender { row -> sent += row.cmid; SendResult.Success }),
        currentOwner = { signedIn },
    )

    private suspend fun enqueue(cmid: String) {
        outbox.enqueue(OutboxMutation(OutboxKind.ADD_REACTION, lane, "t-$cmid", "{}", cmid = cmid))
    }

    @Test
    fun `verdict sends for the author, waits for others and for nobody, exhausts the ownerless`() {
        assertThat(OutboxAuthorGuard.verdict("A", "A")).isEqualTo(AuthorVerdict.SEND)
        assertThat(OutboxAuthorGuard.verdict("A", "B")).isEqualTo(AuthorVerdict.WAIT)
        assertThat(OutboxAuthorGuard.verdict("A", null)).isEqualTo(AuthorVerdict.WAIT)
        assertThat(OutboxAuthorGuard.verdict(null, "A")).isEqualTo(AuthorVerdict.EXHAUST_NO_AUTHOR)
        assertThat(OutboxAuthorGuard.verdict(null, null)).isEqualTo(AuthorVerdict.WAIT)
    }

    @Test
    fun `a row queued by A while B is signed in is neither sent nor deleted nor charged, and leaves when A returns`() = runTest {
        enqueue("a1")
        signedIn = "B"

        drainer().drainLane(lane)

        assertThat(sent).isEmpty()
        val waiting = outbox.observeAll().first().single()
        assertThat(waiting.cmid).isEqualTo("a1")
        assertThat(waiting.attempts).isEqualTo(0)
        assertThat(waiting.state).isEqualTo(OutboxState.PENDING.name)

        signedIn = "A"
        drainer().drainLane(lane)

        assertThat(sent).containsExactly("a1")
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `B's own rows leave while A's wait on the same lane`() = runTest {
        enqueue("a1")
        signedIn = "B"
        enqueue("b1")

        drainer().drainLane(lane)

        assertThat(sent).containsExactly("b1")
        assertThat(outbox.observeAll().first().map { it.cmid }).containsExactly("a1")
    }

    @Test
    fun `a row written before authorship existed gives up unsent and is kept`() = runTest {
        db.outboxDao().upsert(
            me.meeshy.core.database.entity.OutboxEntity(
                "old", lane, "ADD_REACTION", "t", "{}", null, 0, "PENDING", 1, 1,
            ),
        )

        val report = drainer().drainLane(lane)

        assertThat(sent).isEmpty()
        assertThat(report.exhausted).isEqualTo(1)
        val kept = db.outboxDao().find("old")!!
        assertThat(kept.state).isEqualTo(OutboxState.EXHAUSTED.name)
        assertThat(kept.lastError).isEqualTo(OutboxAuthorGuard.REASON_NO_AUTHOR)
    }

    @Test
    fun `a manual retry gives an ownerless row the current author and never steals an owned one`() = runTest {
        db.outboxDao().upsert(
            me.meeshy.core.database.entity.OutboxEntity(
                "old", lane, "ADD_REACTION", "t", "{}", null, 5, "EXHAUSTED", 1, 1,
            ),
        )
        enqueue("mine")
        signedIn = "B"

        outbox.retry("old")
        outbox.retry("mine")

        assertThat(db.outboxDao().find("old")!!.ownerId).isEqualTo("B")
        assertThat(db.outboxDao().find("old")!!.state).isEqualTo(OutboxState.PENDING.name)
        assertThat(db.outboxDao().find("mine")!!.ownerId).isEqualTo("A")
    }
}
