package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.NotificationDao
import me.meeshy.core.database.entity.NotificationEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun row(id: String, createdAt: Long, scopeKey: String = "all", isRead: Boolean = false) =
    NotificationEntity(id = id, scopeKey = scopeKey, payload = "{}", createdAt = createdAt, isRead = isRead, cachedAt = 0L)

@RunWith(RobolectricTestRunner::class)
class NotificationDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: NotificationDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.notificationDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `la lecture rend les lignes du plus recent au plus ancien`() = runTest {
        dao.upsertAll(listOf(row("a", 100), row("b", 300), row("c", 200)))

        assertThat(dao.all("all").map { it.id }).containsExactly("b", "c", "a").inOrder()
        assertThat(dao.observe("all").first().map { it.id }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `la lecture est bornee a sa portee`() = runTest {
        dao.upsertAll(listOf(row("a", 1), row("x", 2, scopeKey = "unread")))

        assertThat(dao.all("all").map { it.id }).containsExactly("a")
        assertThat(dao.all("unread").map { it.id }).containsExactly("x")
    }

    @Test
    fun `upsert remplace la ligne du meme id sans la dupliquer`() = runTest {
        dao.upsertAll(listOf(row("a", 100)))
        dao.upsertAll(listOf(row("a", 100, isRead = true)))

        val rows = dao.all("all")
        assertThat(rows).hasSize(1)
        assertThat(rows.single().isRead).isTrue()
    }

    @Test
    fun `supprimer une ligne ou une portee ne touche pas le reste`() = runTest {
        dao.upsertAll(listOf(row("a", 1), row("b", 2), row("x", 3, scopeKey = "unread")))

        dao.deleteById("a")
        assertThat(dao.all("all").map { it.id }).containsExactly("b")

        dao.deleteScope("all")
        assertThat(dao.all("all")).isEmpty()
        assertThat(dao.all("unread")).hasSize(1)
    }

    @Test
    fun `clear vide la table`() = runTest {
        dao.upsertAll(listOf(row("a", 1), row("b", 2)))

        dao.clear()

        assertThat(dao.all("all")).isEmpty()
    }
}
