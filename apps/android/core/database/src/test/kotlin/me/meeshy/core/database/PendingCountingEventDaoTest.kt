package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import me.meeshy.core.database.dao.PendingCountingEventDao
import me.meeshy.core.database.entity.PendingCountingEventEntity

private fun event(id: String, at: Long, owner: String = "acc", queue: String = "feed", kind: String = "view") =
    PendingCountingEventEntity(eventId = id, owner = owner, queueKey = queue, kind = kind, payload = "{\"id\":\"$id\"}", createdAt = at)

@RunWith(RobolectricTestRunner::class)
class PendingCountingEventDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: PendingCountingEventDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.pendingCountingEventDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `un evenement enfile deux fois avec le meme identifiant n'existe qu'une fois`() = runTest {
        dao.enqueue(event("e1", 10))
        dao.enqueue(event("e1", 10))

        assertThat(dao.count("acc", "feed")).isEqualTo(1)
    }

    @Test
    fun `les evenements sortent du plus ancien au plus recent`() = runTest {
        dao.enqueue(event("c", 30))
        dao.enqueue(event("a", 10))
        dao.enqueue(event("b", 20))

        assertThat(dao.oldest("acc", "feed", 2).map { it.eventId }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `au-dela de 500 lignes pour une file les plus anciennes tombent`() = runTest {
        (1..502).forEach { dao.enqueue(event("e$it", it.toLong())) }

        assertThat(dao.count("acc", "feed")).isEqualTo(500)
        assertThat(dao.oldest("acc", "feed", 1).single().eventId).isEqualTo("e3")
    }

    @Test
    fun `le plafond d'une file ne touche ni une autre file ni un autre compte`() = runTest {
        (1..500).forEach { dao.enqueue(event("o$it", it.toLong(), queue = "story")) }
        (1..500).forEach { dao.enqueue(event("p$it", it.toLong(), owner = "other")) }
        (1..501).forEach { dao.enqueue(event("e$it", it.toLong())) }

        assertThat(dao.count("acc", "story")).isEqualTo(500)
        assertThat(dao.count("other", "feed")).isEqualTo(500)
        assertThat(dao.count("acc", "feed")).isEqualTo(500)
    }

    @Test
    fun `les lignes d'un compte ne sont jamais rendues pour un autre`() = runTest {
        dao.enqueue(event("e1", 1))

        assertThat(dao.oldest("other", "feed", 10)).isEmpty()
        assertThat(dao.queueKeys("other")).isEmpty()
        assertThat(dao.queueKeys("acc")).containsExactly("feed")
    }

    @Test
    fun `supprimer un paquet envoye ne retire que ces evenements de ce compte`() = runTest {
        dao.enqueue(event("e1", 1))
        dao.enqueue(event("e2", 2))
        dao.enqueue(event("e1", 1, owner = "other"))

        dao.delete("acc", listOf("e1"))

        assertThat(dao.oldest("acc", "feed", 10).map { it.eventId }).containsExactly("e2")
        assertThat(dao.count("other", "feed")).isEqualTo(1)
    }

    @Test
    fun `un grand paquet est supprime par troncons`() = runTest {
        val ids = (1..900).map { "e$it" }
        ids.forEachIndexed { i, id -> dao.enqueue(event(id, i.toLong(), queue = "q$i")) }

        dao.delete("acc", ids)

        assertThat(dao.queueKeys("acc")).isEmpty()
    }

    @Test
    fun `supprimer par proprietaire ne touche que lui`() = runTest {
        dao.enqueue(event("e1", 1))
        dao.enqueue(event("e2", 2, owner = "other"))

        dao.deleteOwner("acc")

        assertThat(dao.count("acc", "feed")).isEqualTo(0)
        assertThat(dao.count("other", "feed")).isEqualTo(1)
    }
}
