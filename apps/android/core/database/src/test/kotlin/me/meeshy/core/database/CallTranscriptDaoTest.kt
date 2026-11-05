package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.CallTranscriptDao
import me.meeshy.core.database.entity.CallTranscriptEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun segment(
    callId: String = "call",
    wireId: String,
    capturedAt: Long,
    text: String = "t-$wireId",
    callStartedAt: Long = 1_000,
) = CallTranscriptEntity(
    callId = callId,
    wireId = wireId,
    conversationId = "conv",
    callStartedAt = callStartedAt,
    speakerId = "u1",
    speakerName = "Ada",
    isLocal = false,
    text = text,
    translatedText = null,
    translatedLanguage = null,
    language = "fr",
    capturedAt = capturedAt,
)

@RunWith(RobolectricTestRunner::class)
class CallTranscriptDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: CallTranscriptDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.callTranscriptDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `saveMerging est idempotent par callId et wireId`() = runTest {
        val batch = listOf(segment(wireId = "w1", capturedAt = 1), segment(wireId = "w2", capturedAt = 2))

        dao.saveMerging(batch)
        dao.saveMerging(batch)

        assertThat(dao.observe("call").first().map { it.wireId }).containsExactly("w1", "w2").inOrder()
    }

    @Test
    fun `une reprise garde les segments d'avant et ajoute les nouveaux`() = runTest {
        dao.saveMerging(listOf(segment(wireId = "w1", capturedAt = 1), segment(wireId = "w2", capturedAt = 2)))

        dao.saveMerging(listOf(segment(wireId = "w3", capturedAt = 3), segment(wireId = "w2", capturedAt = 2)))

        assertThat(dao.observe("call").first().map { it.wireId }).containsExactly("w1", "w2", "w3").inOrder()
    }

    @Test
    fun `un segment rejoue met a jour sa traduction`() = runTest {
        dao.saveMerging(listOf(segment(wireId = "w1", capturedAt = 1)))

        dao.saveMerging(listOf(segment(wireId = "w1", capturedAt = 1).copy(translatedText = "hello", translatedLanguage = "en")))

        val row = dao.observe("call").first().single()
        assertThat(row.translatedText).isEqualTo("hello")
        assertThat(row.translatedLanguage).isEqualTo("en")
    }

    @Test
    fun `le debut d'appel d'origine l'emporte apres une reprise`() = runTest {
        dao.saveMerging(listOf(segment(wireId = "w1", capturedAt = 1, callStartedAt = 1_000)))

        dao.saveMerging(listOf(segment(wireId = "w2", capturedAt = 2, callStartedAt = 9_000)))

        assertThat(dao.observe("call").first().map { it.callStartedAt }.toSet()).containsExactly(1_000L)
    }

    @Test
    fun `les segments sont ordonnes par instant de capture`() = runTest {
        dao.saveMerging(listOf(segment(wireId = "b", capturedAt = 20), segment(wireId = "a", capturedAt = 30), segment(wireId = "c", capturedAt = 10)))

        assertThat(dao.observe("call").first().map { it.wireId }).containsExactly("c", "b", "a").inOrder()
    }

    @Test
    fun `deux appels ne se melangent pas et invalidate n'en vide qu'un`() = runTest {
        dao.saveMerging(listOf(segment(callId = "x", wireId = "w1", capturedAt = 1), segment(callId = "y", wireId = "w1", capturedAt = 1)))

        dao.invalidate("x")

        assertThat(dao.observe("x").first()).isEmpty()
        assertThat(dao.observe("y").first()).hasSize(1)
    }

    @Test
    fun `une liste vide ne change rien`() = runTest {
        dao.saveMerging(emptyList())

        assertThat(dao.observe("call").first()).isEmpty()
    }
}
