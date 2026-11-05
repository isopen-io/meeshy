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
import me.meeshy.core.database.dao.SocialEventV2OutboxDao
import me.meeshy.core.database.entity.SocialEventV2OutboxEntity

private const val HOUR = 60L * 60 * 1000

private fun row(id: String, at: Long, owner: String = "acc") =
    SocialEventV2OutboxEntity(eventId = id, owner = owner, payload = "{\"id\":\"$id\"}", createdAt = at)

@RunWith(RobolectricTestRunner::class)
class SocialEventV2OutboxDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: SocialEventV2OutboxDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.socialEventV2OutboxDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `un evenement enfile deux fois n'existe qu'une fois et garde sa charge telle quelle`() = runTest {
        dao.enqueue(row("e1", 100), now = 100)
        dao.enqueue(row("e1", 100), now = 100)

        assertThat(dao.count("acc")).isEqualTo(1)
        assertThat(dao.oldest("acc", 10, now = 100).single().payload).isEqualTo("{\"id\":\"e1\"}")
    }

    @Test
    fun `au-dela de 5000 lignes les plus anciennes tombent`() = runTest {
        (1..5_002).forEach { dao.enqueue(row("e$it", it.toLong()), now = it.toLong()) }

        assertThat(dao.count("acc")).isEqualTo(5_000)
        assertThat(dao.oldest("acc", 1, now = 5_002).single().eventId).isEqualTo("e3")
    }

    @Test
    fun `toute ligne de plus de 72 heures est purgee a l'enfilage`() = runTest {
        val now = 100 * HOUR
        dao.enqueue(row("old", now - 73 * HOUR), now = now - 73 * HOUR)
        dao.enqueue(row("limit", now - 72 * HOUR), now = now - 72 * HOUR)
        dao.enqueue(row("fresh", now - HOUR, owner = "other"), now = now - HOUR)

        dao.enqueue(row("new", now), now = now)

        assertThat(dao.oldest("acc", 10, now = now).map { it.eventId }).containsExactly("limit", "new").inOrder()
        assertThat(dao.count("other")).isEqualTo(1)
    }

    @Test
    fun `purgeStale retire les lignes perimees de tous les comptes`() = runTest {
        val now = 100 * HOUR
        dao.enqueue(row("a", now - 80 * HOUR), now = now - 80 * HOUR)
        dao.enqueue(row("b", now - 80 * HOUR, owner = "other"), now = now - 80 * HOUR)

        dao.purgeStale(now)

        assertThat(dao.count("acc")).isEqualTo(0)
        assertThat(dao.count("other")).isEqualTo(0)
    }

    @Test
    fun `les lignes d'un compte ne sont jamais rendues pour un autre`() = runTest {
        dao.enqueue(row("e1", 1), now = 1)

        assertThat(dao.oldest("other", 10, now = 1)).isEmpty()
    }

    @Test
    fun `un meme identifiant enfile par deux comptes garde une ligne pour chacun`() = runTest {
        dao.enqueue(row("e1", 1, owner = "acc"), now = 1)
        dao.enqueue(row("e1", 2, owner = "other"), now = 2)

        assertThat(dao.count("acc")).isEqualTo(1)
        assertThat(dao.count("other")).isEqualTo(1)
        assertThat(dao.oldest("acc", 10, now = 2).single().createdAt).isEqualTo(1)
    }

    @Test
    fun `une ligne de plus de 72 heures n'est jamais rendue a l'envoi meme avant sa purge`() = runTest {
        val now = 100 * HOUR
        dao.enqueue(row("old", now - 73 * HOUR), now = now - 73 * HOUR)
        dao.enqueue(row("limit", now - 72 * HOUR), now = now - 72 * HOUR)
        dao.enqueue(row("fresh", now - HOUR), now = now - HOUR)

        assertThat(dao.oldest("acc", 10, now = now).map { it.eventId }).containsExactly("limit", "fresh").inOrder()
    }

    @Test
    fun `supprimer un paquet ou un proprietaire ne touche que lui`() = runTest {
        dao.enqueue(row("e1", 1), now = 1)
        dao.enqueue(row("e2", 2), now = 2)
        dao.enqueue(row("e1", 1, owner = "other"), now = 2)
        assertThat(dao.count("acc")).isEqualTo(2)

        dao.delete("acc", listOf("e1"))
        assertThat(dao.oldest("acc", 10, now = 2).map { it.eventId }).containsExactly("e2")
        assertThat(dao.oldest("other", 10, now = 2).map { it.eventId }).containsExactly("e1")

        dao.deleteOwner("acc")
        assertThat(dao.count("acc")).isEqualTo(0)
        assertThat(dao.count("other")).isEqualTo(1)
    }
}
