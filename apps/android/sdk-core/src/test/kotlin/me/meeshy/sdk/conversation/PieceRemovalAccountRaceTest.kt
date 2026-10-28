package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13560, #13596 — A retire une pièce ; la passerelle refuse APRÈS que A s'est déconnecté et que B s'est connecté.
 * Le retour de la pièce appartient au geste de A : il ne s'écrit jamais dans la ligne de B du même message.
 */
@RunWith(RobolectricTestRunner::class)
class PieceRemovalAccountRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val mediaApi: MediaApi = mockk()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun photo(id: String) = ApiMessageAttachment(id = id, mimeType = "image/jpeg")

    private suspend fun seed(vararg pieces: String) = db.messageDao().upsertAll(
        listOf(
            MessageEntityFactory.cached(
                ApiMessage(id = "m1", conversationId = "c1", content = "", attachments = pieces.map(::photo)),
                1L,
            ),
        ),
    )

    private suspend fun signOutThenSignInAsB() {
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
        seed("a")
    }

    private fun remover() = MessageAttachmentRemover(CachedMessageUpdater(db, db.messageDao(), fence), mediaApi)

    private suspend fun cachedPieces() =
        MeeshyApi.json.decodeFromString<ApiMessage>(db.messageDao().find("m1")!!.payload).attachments.map { it.id }

    @Test
    fun `a refusal answered after B signed in never puts A's piece into B's row`(): Unit = runBlocking {
        seed("a", "b")
        coEvery { mediaApi.delete("b") } coAnswers {
            signOutThenSignInAsB()
            throw IOException("offline")
        }

        remover().remove("m1", "b")

        assertThat(cachedPieces()).containsExactly("a")
    }

    @Test
    fun `a refusal answered while A is still signed in puts the piece back`(): Unit = runBlocking {
        seed("a", "b")
        coEvery { mediaApi.delete("b") } throws IOException("offline")

        assertThat(remover().remove("m1", "b")).isEqualTo(PieceRemoval.FAILED)

        assertThat(cachedPieces()).containsExactly("a", "b").inOrder()
    }
}
