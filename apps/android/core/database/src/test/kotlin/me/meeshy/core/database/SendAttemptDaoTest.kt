package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.SendAttemptDao
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private suspend fun SendAttemptDao.log(localId: String, outcome: String = "failure", startedAt: Long = 10L, error: String? = null) =
    append(localId, "rest", startedAt, startedAt + 5, outcome, error)

@RunWith(RobolectricTestRunner::class)
class SendAttemptDaoTest {

    private val db: MeeshyDatabase by lazy {
        Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }
    private val dao by lazy { db.sendAttemptDao() }

    @After
    fun tearDown() = db.close()

    @Test
    fun `le numero de tentative est monotone par message`() = runTest {
        dao.log("c1")
        dao.log("c2")
        dao.log("c1")
        dao.log("c1", outcome = "success")

        assertThat(dao.forMessage("c1").map { it.attemptNumber }).containsExactly(1, 2, 3).inOrder()
        assertThat(dao.forMessage("c2").map { it.attemptNumber }).containsExactly(1)
    }

    @Test
    fun `les tentatives sortent dans l ordre chronologique avec leur erreur`() = runTest {
        dao.log("c1", error = "timeout")
        dao.log("c1", outcome = "success", startedAt = 40L)

        val rows = dao.observe("c1").first()
        assertThat(rows.map { it.outcome }).containsExactly("failure", "success").inOrder()
        assertThat(rows.first().errorMessage).isEqualTo("timeout")
        assertThat(rows.last().errorMessage).isNull()
    }

    @Test
    fun `le journal survit a l ACK tant que le message n est pas supprime`() = runTest {
        dao.log("c1", outcome = "success")

        assertThat(dao.forMessage("c1")).hasSize(1)
        dao.deleteForMessages(listOf("c1"))
        assertThat(dao.forMessage("c1")).isEmpty()
    }
}
