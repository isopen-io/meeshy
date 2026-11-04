package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.CallNetworkJournalDao
import me.meeshy.core.database.entity.CallNetworkJournalEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private const val DAY = 24L * 60 * 60 * 1000

private fun journal(account: String, callId: String, startedAt: Long, payload: String = "[]") =
    CallNetworkJournalEntity(account = account, callId = callId, startedAt = startedAt, payload = payload, updatedAt = startedAt)

@RunWith(RobolectricTestRunner::class)
class CallNetworkJournalDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: CallNetworkJournalDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.callNetworkJournalDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `observe emet le journal puis sa mise a jour`() = runTest {
        assertThat(dao.observe("acc", "c1").first()).isNull()

        dao.upsert(journal("acc", "c1", 10, payload = "[1]"))
        dao.upsert(journal("acc", "c1", 10, payload = "[1,2]"))

        assertThat(dao.observe("acc", "c1").first()?.payload).isEqualTo("[1,2]")
    }

    @Test
    fun `un journal est invisible depuis un autre compte`() = runTest {
        dao.upsert(journal("a", "c1", 10))

        assertThat(dao.get("b", "c1")).isNull()
        assertThat(dao.get("a", "c1")).isNotNull()
    }

    @Test
    fun `la retention supprime ce qui a plus de trente jours`() = runTest {
        val now = 100 * DAY
        dao.upsert(journal("a", "old", now - 31 * DAY))
        dao.upsert(journal("a", "edge", now - 30 * DAY))
        dao.upsert(journal("a", "new", now - DAY))

        dao.prune(account = "a", now = now)

        assertThat(dao.callIds("a")).containsExactly("new", "edge")
    }

    @Test
    fun `la retention borne a deux cents appels en gardant les plus recents`() = runTest {
        val now = 100 * DAY
        (1..205).forEach { dao.upsert(journal("a", "c$it", now - 20 * DAY + it)) }

        dao.prune(account = "a", now = now)

        val kept = dao.callIds("a")
        assertThat(kept).hasSize(200)
        assertThat(kept).doesNotContain("c1")
        assertThat(kept).doesNotContain("c5")
        assertThat(kept).contains("c6")
        assertThat(kept).contains("c205")
    }

    @Test
    fun `la retention d'un compte ne touche pas les autres`() = runTest {
        val now = 100 * DAY
        dao.upsert(journal("a", "old", now - 40 * DAY))
        dao.upsert(journal("b", "old", now - 40 * DAY))

        dao.prune(account = "a", now = now)

        assertThat(dao.callIds("a")).isEmpty()
        assertThat(dao.callIds("b")).containsExactly("old")
    }

    @Test
    fun `saveAndPrune enregistre puis applique la retention en une transaction`() = runTest {
        val now = 100 * DAY
        dao.upsert(journal("a", "old", now - 40 * DAY))

        dao.saveAndPrune(journal("a", "fresh", now), now)

        assertThat(dao.callIds("a")).containsExactly("fresh")
    }

    @Test
    fun `la purge d'un compte vide ses journaux seulement`() = runTest {
        dao.upsert(journal("a", "c1", 1))
        dao.upsert(journal("b", "c1", 1))

        dao.deleteAccount("a")

        assertThat(dao.callIds("a")).isEmpty()
        assertThat(dao.callIds("b")).containsExactly("c1")
    }

    @Test
    fun `la purge totale vide tous les comptes`() = runTest {
        dao.upsert(journal("a", "c1", 1))
        dao.upsert(journal("b", "c2", 1))

        dao.clear()

        assertThat(dao.callIds("a") + dao.callIds("b")).isEmpty()
    }

    @Test
    fun `delete retire un seul appel`() = runTest {
        dao.upsert(journal("a", "c1", 1))
        dao.upsert(journal("a", "c2", 2))

        dao.delete("a", "c1")

        assertThat(dao.callIds("a")).containsExactly("c2")
    }
}
