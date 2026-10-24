package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.EditRevisionEntity
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun revision(messageId: String = "m1", revision: Int, editedAt: Long = revision * 10L, content: String = "v$revision") =
    EditRevisionEntity(messageId, revision, content, editedAt)

@RunWith(RobolectricTestRunner::class)
class EditRevisionDaoTest {

    private val db: MeeshyDatabase by lazy {
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }
    private val dao by lazy { db.editRevisionDao() }

    @After
    fun tearDown() = db.close()

    @Test
    fun `les revisions d'un message sont triees par numero`() = runTest {
        dao.upsert(revision(revision = 2))
        dao.upsert(revision(revision = 1))

        assertThat(dao.observe("m1").first().map { it.revision }).containsExactly(1, 2).inOrder()
    }

    @Test
    fun `reecrire une revision la remplace`() = runTest {
        dao.upsert(revision(revision = 1, content = "avant"))
        dao.upsert(revision(revision = 1, content = "apres"))

        assertThat(dao.forMessage("m1").map { it.content }).containsExactly("apres")
    }

    @Test
    fun `deleteForMessage ne touche pas les autres messages`() = runTest {
        dao.upsert(revision("m1", 1))
        dao.upsert(revision("m2", 1))

        dao.deleteForMessage("m1")

        assertThat(dao.forMessage("m1")).isEmpty()
        assertThat(dao.forMessage("m2")).hasSize(1)
    }

    @Test
    fun `purgeOlderThan supprime les revisions anterieures a la coupure`() = runTest {
        dao.upsert(revision(revision = 1, editedAt = 10L))
        dao.upsert(revision(revision = 2, editedAt = 50L))

        assertThat(dao.purgeOlderThan(30L)).isEqualTo(1)
        assertThat(dao.forMessage("m1").map { it.revision }).containsExactly(2)
    }
}
