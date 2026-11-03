package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** L'onglet Conversations d'une fiche : `GET conversations?withUserId=…&limit=50` (miroir de `listSharedWith` iOS). */
@RunWith(RobolectricTestRunner::class)
class ConversationRepositorySharedWithTest {

    private lateinit var db: MeeshyDatabase
    private val api = mockk<ConversationApi>()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository() = ConversationRepository(
        api,
        db,
        db.conversationDao(),
        db.syncMetaDao(),
        OutboxRepository(db, db.outboxDao()),
    )

    @Test
    fun `listSharedWith demande les conversations en commun avec la personne et une limite de 50`() = runTest {
        coEvery { api.sharedWith(any(), any()) } returns ApiResponse(success = true, data = emptyList())

        repository().listSharedWith("u-peer")

        coVerify(exactly = 1) { api.sharedWith("u-peer", 50) }
    }

    @Test
    fun `listSharedWith rend les conversations servies et les range dans le cache`() = runTest {
        val served = listOf(ApiConversation(id = "g1", type = "group", title = "Equipe"), ApiConversation(id = "d1"))
        coEvery { api.sharedWith(any(), any()) } returns ApiResponse(success = true, data = served)
        val repo = repository()

        val result = repo.listSharedWith("u-peer")

        assertThat((result as NetworkResult.Success).data.map { it.id }).containsExactly("g1", "d1").inOrder()
        assertThat(repo.conversationStream("g1").first()?.title).isEqualTo("Equipe")
        assertThat(repo.conversationStream("d1").first()?.id).isEqualTo("d1")
    }

    @Test
    fun `listSharedWith remonte l'echec reseau tel quel`() = runTest {
        coEvery { api.sharedWith(any(), any()) } throws IOException("offline")

        val result = repository().listSharedWith("u-peer")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("NETWORK")
    }

    @Test
    fun `listSharedWith d'un identifiant vide n'appelle pas le reseau`() = runTest {
        val result = repository().listSharedWith(" ")

        assertThat((result as NetworkResult.Success).data).isEmpty()
        coVerify(exactly = 0) { api.sharedWith(any(), any()) }
    }

    @Test
    fun `findDirectWith interroge le type direct avec une limite de 1`() = runTest {
        coEvery { api.directWith(any(), any(), any()) } returns ApiResponse(success = true, data = emptyList())

        repository().findDirectWith("u-peer")

        coVerify(exactly = 1) { api.directWith("direct", "u-peer", 1) }
    }
}
