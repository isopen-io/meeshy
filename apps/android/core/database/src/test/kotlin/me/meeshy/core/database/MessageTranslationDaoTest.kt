package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.MessageAudioTranslationEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.MessageTranscriptionEntity
import me.meeshy.core.database.entity.MessageTranslationEntity
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun text(messageId: String = "m1", language: String = "fr", content: String = "Bonjour", updatedAt: Long = 1L) =
    MessageTranslationEntity(messageId, language, content, "en", null, null, updatedAt)

private fun transcription(messageId: String = "m1", attachmentId: String = "a1", text: String = "hello") =
    MessageTranscriptionEntity(messageId, attachmentId, text, "en", null, null, 1L)

private fun audio(messageId: String = "m1", attachmentId: String = "a1", language: String = "fr", url: String = "https://x/fr.m4a") =
    MessageAudioTranslationEntity(messageId, attachmentId, language, url, "", null, null, false, null, null, null, 1L)

/** Le préchauffage du L1 ne relit que les traductions dont le message est encore en cache. */
private fun cachedMessage(id: String) =
    MessageEntity(id = id, conversationId = "c1", seq = null, payload = "{}", createdAt = 1L, cachedAt = 0L)

@RunWith(RobolectricTestRunner::class)
class MessageTranslationDaoTest {

    private val db: MeeshyDatabase by lazy {
        Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }
    private val dao by lazy { db.messageTranslationDao() }

    @After
    fun tearDown() = db.close()

    @Test
    fun `une traduction reecrite pour la meme langue remplace la ligne`() = runTest {
        dao.upsertText(text(content = "Salut"))
        dao.upsertText(text(content = "Bonjour"))

        assertThat(dao.textsFor(listOf("m1")).map { it.content }).containsExactly("Bonjour")
    }

    @Test
    fun `le meme upsert deux fois laisse une seule ligne`() = runTest {
        repeat(2) { dao.upsertText(text()) }
        repeat(2) { dao.upsertTranscription(transcription()) }
        repeat(2) { dao.upsertAudio(audio()) }

        assertThat(dao.textsFor(listOf("m1"))).hasSize(1)
        assertThat(dao.transcriptionsFor(listOf("m1"))).hasSize(1)
        assertThat(dao.audioFor(listOf("m1"))).hasSize(1)
    }

    @Test
    fun `deux langues d'un meme message gardent chacune leur ligne`() = runTest {
        dao.upsertText(text(language = "fr"))
        dao.upsertText(text(language = "es", content = "Hola"))

        assertThat(dao.textsFor(listOf("m1")).map { it.language }).containsExactly("fr", "es")
    }

    @Test
    fun `la lecture groupee rend les lignes de plusieurs messages en une requete`() = runTest {
        dao.upsertText(text(messageId = "m1"))
        dao.upsertText(text(messageId = "m2"))
        dao.upsertText(text(messageId = "m3"))

        assertThat(dao.textsFor(listOf("m1", "m3")).map { it.messageId }).containsExactly("m1", "m3")
    }

    @Test
    fun `supprimer un message retire ses trois familles et epargne les autres`() = runTest {
        dao.upsertText(text(messageId = "m1"))
        dao.upsertText(text(messageId = "m2"))
        dao.upsertTranscription(transcription(messageId = "m1"))
        dao.upsertAudio(audio(messageId = "m1"))

        dao.deleteTextsFor(listOf("m1"))
        dao.deleteTranscriptionsFor(listOf("m1"))
        dao.deleteAudioFor(listOf("m1"))

        assertThat(dao.textsFor(listOf("m1", "m2")).map { it.messageId }).containsExactly("m2")
        assertThat(dao.transcriptionsFor(listOf("m1"))).isEmpty()
        assertThat(dao.audioFor(listOf("m1"))).isEmpty()
    }

    @Test
    fun `les messages traduits les plus recemment viennent en premier`() = runTest {
        db.messageDao().upsertAll(listOf(cachedMessage("old"), cachedMessage("new")))
        dao.upsertText(text(messageId = "old", updatedAt = 1L))
        dao.upsertText(text(messageId = "new", updatedAt = 9L))

        assertThat(dao.recentTranslatedMessageIds(1)).containsExactly("new")
    }
}
