package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.DirectoryContactEntity
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun contact(id: String, sortIndex: Int) = DirectoryContactEntity(id, "{\"id\":\"$id\"}", sortIndex, 1L)

@RunWith(RobolectricTestRunner::class)
class DirectoryContactDaoTest {

    private val db: MeeshyDatabase by lazy {
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }
    private val dao by lazy { db.directoryContactDao() }

    @After
    fun tearDown() = db.close()

    @Test
    fun `les contacts sont servis dans l'ordre du repertoire`() = runTest {
        dao.insertAll(listOf(contact("b", 1), contact("a", 0)))

        assertThat(dao.observeAll().first().map { it.contactId }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `replaceAll remplace tout le repertoire`() = runTest {
        dao.insertAll(listOf(contact("a", 0), contact("b", 1)))

        dao.replaceAll(listOf(contact("c", 0)))

        assertThat(dao.all().map { it.contactId }).containsExactly("c")
    }

    @Test
    fun `le payload JSON est conserve tel quel`() = runTest {
        dao.insertAll(listOf(contact("a", 0)))

        assertThat(dao.all().single().payload).isEqualTo("{\"id\":\"a\"}")
    }
}
