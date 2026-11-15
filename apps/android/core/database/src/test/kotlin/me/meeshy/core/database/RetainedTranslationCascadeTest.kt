package me.meeshy.core.database

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.MessageAudioTranslationEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.MessageTranscriptionEntity
import me.meeshy.core.database.entity.MessageTranslationEntity
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun message(id: String, conversationId: String = "c1", serverId: String? = null, createdAt: Long = 10L, sendState: String? = null) =
    MessageEntity(
        id = id, conversationId = conversationId, seq = null, payload = "{}", createdAt = createdAt, cachedAt = 0L,
        sendState = sendState, serverId = serverId,
    )

/** Supprimer un message par N'IMPORTE QUELLE porte du DAO ne laisse aucune traduction, transcription ni piste audio. */
@RunWith(RobolectricTestRunner::class)
class RetainedTranslationCascadeTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun openAsTheAppDoes(location: DatabaseLocation = DatabaseLocation.Memory): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(context, location).allowMainThreadQueries().build()

    private suspend fun MeeshyDatabase.retain(key: String) {
        val dao = messageTranslationDao()
        dao.upsertText(MessageTranslationEntity(key, "fr", "texte traduit", "en", null, null, 1L))
        dao.upsertTranscription(MessageTranscriptionEntity(key, "a1", "texte transcrit", "en", null, null, 1L))
        dao.upsertAudio(MessageAudioTranslationEntity(key, "a1", "fr", "https://cdn/fr.m4a", "voix", null, null, false, null, null, null, 1L))
    }

    private suspend fun MeeshyDatabase.retained(vararg keys: String): Int {
        val dao = messageTranslationDao()
        val all = keys.toList()
        return dao.textsFor(all).size + dao.transcriptionsFor(all).size + dao.audioFor(all).size
    }

    private fun withDatabase(block: suspend (MeeshyDatabase) -> Unit) = runTest {
        val database = openAsTheAppDoes()
        try {
            block(database)
        } finally {
            database.close()
        }
    }

    /** Deux messages : `gone` (id local `cid_gone`, id serveur `srv_gone`) qui part, `kept` qui reste. */
    private suspend fun MeeshyDatabase.seedPair() {
        messageDao().upsertAll(listOf(message("cid_gone", serverId = "srv_gone"), message("kept", conversationId = "c2")))
        retain("srv_gone")
        retain("cid_gone")
        retain("kept")
    }

    private suspend fun MeeshyDatabase.assertOnlyKeptRemains() {
        assertThat(retained("srv_gone", "cid_gone")).isEqualTo(0)
        assertThat(retained("kept")).isEqualTo(3)
    }

    @Test
    fun `la configuration de production installe le declencheur`() = withDatabase { db ->
        val present = db.openHelper.writableDatabase
            .query("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = '${RetainedTranslationCascade.TRIGGER}'")
            .use { it.count }

        assertThat(present).isEqualTo(1)
    }

    @Test
    fun `deleteByIds emporte les lignes rangees sous l'id local et sous l'id serveur`() = withDatabase { db ->
        db.seedPair()

        db.messageDao().deleteByIds(listOf("cid_gone"))

        db.assertOnlyKeptRemains()
    }

    @Test
    fun `quitter une conversation ou en etre banni emporte ses lignes retenues`() = withDatabase { db ->
        db.seedPair()

        db.messageDao().clearConversation("c1")

        db.assertOnlyKeptRemains()
    }

    @Test
    fun `l'elagage de synchro emporte les lignes du message que la page ne sert plus`() = withDatabase { db ->
        db.seedPair()
        db.messageDao().upsertAll(listOf(message("served")))
        db.retain("served")

        db.messageDao().deleteMissing("c1", listOf("served"))

        db.assertOnlyKeptRemains()
        assertThat(db.retained("served")).isEqualTo(3)
    }

    @Test
    fun `l'elagage fenetre emporte aussi les lignes`() = withDatabase { db ->
        db.seedPair()

        db.messageDao().deleteMissingSince("c1", minCreatedAt = 0L, ids = listOf("aucun"))

        db.assertOnlyKeptRemains()
    }

    @Test
    fun `vider le cache emporte les lignes des charges purgees et epargne la vue unique ouverte`() = withDatabase { db ->
        db.messageDao().upsertAll(
            listOf(message("cid_gone", serverId = "srv_gone"), message("opened", conversationId = "c2").copy(viewOnceOpenedAt = 5L)),
        )
        db.retain("srv_gone")
        db.retain("opened")

        db.messageDao().clearPurgeable()

        assertThat(db.retained("srv_gone")).isEqualTo(0)
        assertThat(db.retained("opened")).isEqualTo(3)
    }

    @Test
    fun `tout effacer emporte toutes les lignes retenues`() = withDatabase { db ->
        db.seedPair()

        db.messageDao().clear()

        assertThat(db.retained("srv_gone", "cid_gone", "kept")).isEqualTo(0)
    }

    @Test
    fun `une bulle optimiste remplacee garde les lignes que sa jumelle serveur porte encore`() = withDatabase { db ->
        db.messageDao().upsertAll(listOf(message("cid_1", serverId = "srv_1"), message("srv_1", serverId = "srv_1")))
        db.retain("srv_1")

        db.messageDao().deleteByIds(listOf("cid_1"))

        assertThat(db.retained("srv_1")).isEqualTo(3)
    }

    @Test
    fun `les orphelins laisses par une version anterieure sont balayes a l'ouverture et jamais rehydrates`() = runTest {
        val name = "retained-cascade-sweep.db"
        context.deleteDatabase(name)
        val first = openAsTheAppDoes(DatabaseLocation.Named(name))
        first.messageDao().upsertAll(listOf(message("kept")))
        first.retain("kept")
        first.retain("orphan")
        first.close()

        val reopened = openAsTheAppDoes(DatabaseLocation.Named(name))
        try {
            assertThat(reopened.retained("orphan")).isEqualTo(0)
            assertThat(reopened.retained("kept")).isEqualTo(3)
            assertThat(reopened.messageTranslationDao().recentTranslatedMessageIds(80)).containsExactly("kept")
        } finally {
            reopened.close()
            context.deleteDatabase(name)
        }
    }

    @Test
    fun `le prechauffage du L1 ignore une ligne dont le message est parti`() = withDatabase { db ->
        db.messageDao().upsertAll(listOf(message("kept")))
        db.retain("kept")
        db.retain("orphan")

        assertThat(db.messageTranslationDao().recentTranslatedMessageIds(80)).containsExactly("kept")
    }
}
