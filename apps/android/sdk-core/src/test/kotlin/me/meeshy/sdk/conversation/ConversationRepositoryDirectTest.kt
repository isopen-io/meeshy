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
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.directConversationRequest
import me.meeshy.sdk.model.directName
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #11615 — le résolveur UNIQUE de « la conversation directe avec cette personne » :
 * cache, puis API, puis création. La réponse à une story, à une humeur et le bouton Message
 * d'un profil l'appellent tous ; deux gestes ne choisissent donc jamais deux conversations
 * pour un même auteur (miroir de `DirectConversationResolver`, iOS).
 */
@RunWith(RobolectricTestRunner::class)
class ConversationRepositoryDirectTest {

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

    private val reader = ApiParticipant(id = "p-reader", userId = "u-reader", displayName = "Moi")
    private val peer = ApiParticipant(id = "p-peer", userId = "u-peer", displayName = "Mc")
    private val stranger = ApiParticipant(id = "p-other", userId = "u-other", displayName = "Zoe")

    private fun direct(
        id: String,
        peers: List<ApiParticipant> = listOf(reader, peer),
        lastMessage: ApiConversationLastMessage? = null,
    ) = ApiConversation(id = id, type = "direct", participants = peers, lastMessage = lastMessage)

    private suspend fun cache(conversation: ApiConversation, updatedAt: Long = 1L) {
        db.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = conversation.id,
                    payload = MeeshyApi.json.encodeToString(conversation),
                    updatedAt = updatedAt,
                    cachedAt = updatedAt,
                    unreadCount = conversation.unreadCount,
                ),
            ),
        )
    }

    private fun serving(vararg conversations: ApiConversation) {
        coEvery { api.directWith(any(), any(), any()) } returns
            ApiResponse(success = true, data = conversations.toList())
    }

    private fun offline() {
        coEvery { api.directWith(any(), any(), any()) } throws IOException("offline")
        coEvery { api.create(any()) } throws IOException("offline")
    }

    // MARK: le cache

    @Test
    fun `cachedDirectWith rend le direct le plus recent qui nomme la personne`() = runTest {
        cache(direct("old"), updatedAt = 10L)
        cache(direct("recent"), updatedAt = 20L)

        assertThat(repository().cachedDirectWith("u-peer")?.id).isEqualTo("recent")
    }

    @Test
    fun `cachedDirectWith ignore un groupe, un autre direct et une simple mention dans un apercu`() = runTest {
        cache(ApiConversation(id = "group", type = "group", participants = listOf(reader, peer)), updatedAt = 30L)
        cache(direct("other", peers = listOf(reader, stranger)), updatedAt = 20L)
        cache(
            direct(
                "mention",
                peers = listOf(reader, stranger),
                lastMessage = ApiConversationLastMessage(id = "m1", content = "salut u-peer"),
            ),
            updatedAt = 10L,
        )

        assertThat(repository().cachedDirectWith("u-peer")).isNull()
    }

    @Test
    fun `cachedDirectWith lit l'identifiant litteralement, jamais comme un motif`() = runTest {
        cache(direct("c1"))

        assertThat(repository().cachedDirectWith("%")).isNull()
        assertThat(repository().cachedDirectWith("u_peer")).isNull()
        assertThat(repository().cachedDirectWith("")).isNull()
    }

    // MARK: findDirectWith — cache puis API

    @Test
    fun `findDirectWith lit le cache d'abord et n'appelle pas l'API`() = runTest {
        cache(direct("c1"))

        val result = repository().findDirectWith("u-peer")

        assertThat((result as NetworkResult.Success).data?.id).isEqualTo("c1")
        coVerify(exactly = 0) { api.directWith(any(), any(), any()) }
    }

    @Test
    fun `findDirectWith interroge l'API en direct avec la personne et range le resultat dans le cache`() = runTest {
        serving(direct("c9"))
        val repo = repository()

        val result = repo.findDirectWith("u-peer")

        assertThat((result as NetworkResult.Success).data?.id).isEqualTo("c9")
        coVerify(exactly = 1) { api.directWith("direct", "u-peer", 1) }
        assertThat(repo.conversationStream("c9").first()?.id).isEqualTo("c9")
    }

    @Test
    fun `findDirectWith rend null quand aucun direct n'existe`() = runTest {
        serving()

        val result = repository().findDirectWith("u-peer")

        assertThat((result as NetworkResult.Success).data).isNull()
    }

    @Test
    fun `findDirectWith remonte l'echec reseau tel quel`() = runTest {
        offline()

        val result = repository().findDirectWith("u-peer")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("NETWORK")
    }

    // MARK: directConversationWith — le dernier direct, sinon un neuf

    @Test
    fun `un direct du cache s'ouvre sans reseau`() = runTest {
        cache(direct("c1"))

        val resolution = repository().directConversationWith("u-peer")

        assertThat(resolution).isEqualTo(DirectConversationResolution.Found(direct("c1"), fromCache = true))
        coVerify(exactly = 0) { api.directWith(any(), any(), any()) }
        coVerify(exactly = 0) { api.create(any()) }
    }

    @Test
    fun `hors ligne le direct du cache s'ouvre quand meme`() = runTest {
        cache(direct("c1"))
        offline()

        val resolution = repository().directConversationWith("u-peer")

        assertThat(resolution.conversationOrNull?.id).isEqualTo("c1")
    }

    @Test
    fun `un direct trouve par l'API est rendu sans creation`() = runTest {
        serving(direct("c9"))

        val resolution = repository().directConversationWith("u-peer")

        assertThat(resolution).isEqualTo(DirectConversationResolution.Found(direct("c9"), fromCache = false))
        coVerify(exactly = 0) { api.create(any()) }
    }

    @Test
    fun `sans direct existant il en cree un par la demande unique et le range dans le cache`() = runTest {
        serving()
        val created = direct("new")
        coEvery { api.create(any()) } returns ApiResponse(success = true, data = created)
        val repo = repository()

        val resolution = repo.directConversationWith("u-peer")

        assertThat(resolution).isEqualTo(DirectConversationResolution.Created(created))
        coVerify(exactly = 1) { api.create(directConversationRequest("u-peer")) }
        assertThat(repo.conversationStream("new").first()?.id).isEqualTo("new")
    }

    @Test
    fun `le deuxieme geste retrouve la conversation creee par le premier`() = runTest {
        serving()
        coEvery { api.create(any()) } returns ApiResponse(success = true, data = direct("new"))
        val repo = repository()

        val first = repo.directConversationWith("u-peer")
        val second = repo.directConversationWith("u-peer")

        assertThat(first.conversationOrNull?.id).isEqualTo("new")
        assertThat(second).isEqualTo(DirectConversationResolution.Found(direct("new"), fromCache = true))
        coVerify(exactly = 1) { api.create(any<CreateConversationRequest>()) }
    }

    // MARK: hors ligne — la création est mise en file, ou l'échec le dit

    @Test
    fun `hors ligne sans cache la creation est mise en file quand une file est fournie`() = runTest {
        offline()
        val queued = mutableListOf<String>()

        val resolution = repository().directConversationWith(
            "u-peer",
            DirectCreationQueue { userId ->
                queued += userId
                true
            },
        )

        assertThat(resolution).isEqualTo(DirectConversationResolution.Queued("u-peer"))
        assertThat(queued).containsExactly("u-peer")
    }

    @Test
    fun `hors ligne sans file l'echec dit qu'il manque le reseau`() = runTest {
        offline()

        val resolution = repository().directConversationWith("u-peer")

        assertThat((resolution as DirectConversationResolution.Failed).offline).isTrue()
        assertThat(resolution.conversationOrNull).isNull()
    }

    @Test
    fun `une file qui refuse laisse l'echec`() = runTest {
        offline()

        val resolution = repository().directConversationWith("u-peer", DirectCreationQueue { false })

        assertThat(resolution).isInstanceOf(DirectConversationResolution.Failed::class.java)
    }

    @Test
    fun `un refus du serveur n'est pas hors ligne et ne met rien en file`() = runTest {
        coEvery { api.directWith(any(), any(), any()) } returns
            ApiResponse<List<ApiConversation>>(success = false, error = "boom")
        var enqueued = false

        val resolution = repository().directConversationWith(
            "u-peer",
            DirectCreationQueue {
                enqueued = true
                true
            },
        )

        assertThat((resolution as DirectConversationResolution.Failed).offline).isFalse()
        assertThat(enqueued).isFalse()
    }

    @Test
    fun `l'echec de creation hors ligne est mis en file apres une recherche sans direct`() = runTest {
        serving()
        coEvery { api.create(any()) } throws IOException("offline")

        val resolution = repository().directConversationWith("u-peer", DirectCreationQueue { true })

        assertThat(resolution).isEqualTo(DirectConversationResolution.Queued("u-peer"))
    }

    // MARK: le report de l'élection à la synchronisation

    @Test
    fun `une synchro qui ne sert pas les participants garde ceux du cache et le nom du direct`() = runTest {
        cache(direct("c1"))
        coEvery { api.listConditional(any(), any(), any(), any()) } returns
            retrofit2.Response.success(
                ApiResponse(success = true, data = listOf(direct("c1", peers = emptyList()))),
            )
        val repo = repository()

        repo.refresh()

        val stored = repo.conversationStream("c1").first()
        assertThat(stored?.participants).containsExactly(reader, peer).inOrder()
        assertThat(stored?.directName(readerId = "u-reader")).isEqualTo("Mc")
    }

    @Test
    fun `une synchro qui sert les participants les remplace`() = runTest {
        cache(direct("c1"))
        val renamed = peer.copy(displayName = "Mc Renomme")
        coEvery { api.listConditional(any(), any(), any(), any()) } returns
            retrofit2.Response.success(
                ApiResponse(success = true, data = listOf(direct("c1", peers = listOf(reader, renamed)))),
            )
        val repo = repository()

        repo.refresh()

        assertThat(repo.conversationStream("c1").first()?.directName(readerId = "u-reader")).isEqualTo("Mc Renomme")
    }
}
