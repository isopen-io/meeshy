package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SendAttemptDao
import me.meeshy.sdk.model.SendOutcome
import me.meeshy.sdk.model.SendTransport
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private suspend fun SendAttemptRecorder.log(
    transport: SendTransport,
    outcome: SendOutcome,
    error: String? = null,
    localId: String = "cid_1",
) = record(localId, transport, startedAtMillis = 100L, finishedAtMillis = 150L, outcome = outcome, errorMessage = error)

@RunWith(RobolectricTestRunner::class)
class SendAttemptRecorderTest {

    private fun database() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()

    @Test
    fun `des tentatives successives gardent numero, transport, issue et horodatage`() = runTest {
        val db = database()
        try {
            val recorder = RoomSendAttemptRecorder(db.sendAttemptDao())
            recorder.log(SendTransport.REST, SendOutcome.FAILURE, error = "HTTP 503")
            recorder.log(SendTransport.OUTBOX, SendOutcome.SUCCESS)

            val rows = db.sendAttemptDao().forMessage("cid_1")
            assertThat(rows.map { it.attemptNumber }).containsExactly(1, 2).inOrder()
            assertThat(rows.map { it.transport }).containsExactly("rest", "outbox").inOrder()
            assertThat(rows.map { it.outcome }).containsExactly("failure", "success").inOrder()
            assertThat(rows.first().errorMessage).isEqualTo("HTTP 503")
            assertThat(rows.first().startedAt).isEqualTo(100L)
            assertThat(rows.first().finishedAt).isEqualTo(150L)
        } finally {
            db.close()
        }
    }

    @Test
    fun `la numerotation est propre a chaque message`() = runTest {
        val db = database()
        try {
            val recorder = RoomSendAttemptRecorder(db.sendAttemptDao())
            recorder.log(SendTransport.REST, SendOutcome.SUCCESS, localId = "cid_a")
            recorder.log(SendTransport.REST, SendOutcome.SUCCESS, localId = "cid_b")

            assertThat(db.sendAttemptDao().forMessage("cid_b").single().attemptNumber).isEqualTo(1)
        } finally {
            db.close()
        }
    }

    @Test
    fun `une panne du journal ne fait jamais echouer l envoi`() = runTest {
        val dao = mockk<SendAttemptDao>()
        coEvery { dao.append(any(), any(), any(), any(), any(), any()) } throws IllegalStateException("disque plein")

        RoomSendAttemptRecorder(dao).log(SendTransport.REST, SendOutcome.SUCCESS)
    }
}
