package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PublicProfile
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationLinkWire
import me.meeshy.sdk.model.relation.RelationProgressWire
import me.meeshy.sdk.model.relation.RelationRitualPhase
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.RelationLevelResponse
import me.meeshy.sdk.net.api.RelationLowerBody
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.model.relation.RelationRaiseGate
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** « Mes cercles » côté dépôt (#13938) : cache d'abord, la demande d'un cran par la file, des personnes jamais inventées. */
@RunWith(RobolectricTestRunner::class)
class RelationsRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val api = mockk<RelationsApi>()
    private val friends = mockk<FriendRepository>(relaxed = true)
    private val friendList = mockk<FriendListRepository>()
    private val users = mockk<UserRepository>()
    private val outbox = mockk<OutboxRepository>(relaxed = true)
    private var flushes = 0

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun repository(cache: FriendshipCache = FriendshipCache()) = RelationsRepository(
        api = api,
        cache = KeyedJsonCache(db.keyedJsonCacheDao(), FakeClock()),
        friends = friends,
        friendList = friendList,
        friendshipCache = cache,
        outbox = outbox,
        users = users,
        flush = { flushes++ },
    )

    private val friendLink = RelationLinkWire(
        userId = "u1",
        effectiveLevel = "FRIEND",
        grantedByMe = "FRIEND",
        progress = RelationProgressWire(activeWeeks = 2, needed = 4, missing = emptyList()),
    )

    @Test
    fun `a froid rien n'est peint, puis les liens servis reviennent du disque sans reseau`() = runTest {
        coEvery { api.links() } returns ApiResponse(success = true, data = listOf(friendLink))
        val repository = repository()

        assertThat(repository.cachedLinks()).isNull()
        val served = (repository.refreshLinks() as NetworkResult.Success).data

        assertThat(served.single().effectiveLevel).isEqualTo(RelationLevel.FRIEND)
        assertThat(repository().cachedLinks()).isEqualTo(served)
    }

    @Test
    fun `une panne garde les derniers liens connus`() = runTest {
        coEvery { api.links() } returnsMany listOf(ApiResponse(success = true, data = listOf(friendLink)))
        val repository = repository()
        repository.refreshLinks()
        coEvery { api.links() } throws IOException("offline")

        assertThat(repository.refreshLinks()).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(repository.cachedLinks()?.map { it.userId }).containsExactly("u1")
    }

    @Test
    fun `demander un cran part par la file avec le niveau vise`() = runTest {
        coEvery { friends.enqueueSendFriendRequest(receiverId = "u1", cmid = any(), message = null, targetLevel = "CLOSE") } returns "cmid-1"

        assertThat(repository().enqueueRaise("u1", RelationLevel.CLOSE)).isEqualTo("cmid-1")
        coVerify(exactly = 1) { friends.enqueueSendFriendRequest(receiverId = "u1", cmid = any(), message = null, targetLevel = "CLOSE") }
        assertThat(flushes).isEqualTo(1)
    }

    @Test
    fun `le rituel envoie sa phase et rend le refus type du serveur`() = runTest {
        coEvery { api.ritual("u1", any()) } returns
            ApiResponse(success = false, error = "L'autre a lâché", code = "RELATION_RITUAL_LAPSED")

        val outcome = repository().ritual("u1", RelationRitualPhase.CONFIRM, token = "t", consents = null)

        assertThat((outcome as NetworkResult.Failure).error.code).isEqualTo("RELATION_RITUAL_LAPSED")
    }

    @Test
    fun `les personnes se nomment par le cache des amis, puis par le profil, et un profil illisible reste absent`() = runTest {
        coEvery { friendList.cachedSnapshot() } returns listOf(FriendRequestUser(id = "f", username = "fanny", displayName = "Fanny"))
        coEvery { users.getPublicProfile("p", emptySet()) } returns
            NetworkResult.Success(PublicProfile(user = MeeshyUser(id = "p", username = "paul", firstName = "Paul", lastName = "Dupont")))
        coEvery { users.getPublicProfile("x", emptySet()) } throws IOException("offline")

        val people = repository().people(listOf("f", "p", "x", "f"))

        assertThat(people).containsExactly(
            "f", CirclePerson("f", "Fanny", "fanny", null),
            "p", CirclePerson("p", "Paul Dupont", "paul", null),
        )
        coVerify(exactly = 0) { users.getPublicProfile("f", any()) }
    }

    @Test
    fun `retrograder poste le cran vise et reecrit le lien en cache`() = runTest {
        val close = friendLink.copy(userId = "u1", effectiveLevel = "CLOSE", grantedByMe = "CLOSE")
        coEvery { api.links() } returns ApiResponse(success = true, data = listOf(close, friendLink.copy(userId = "u2")))
        coEvery { api.lower("u1", RelationLowerBody("FRIEND")) } returns ApiResponse(success = true, data = friendLink)
        val repository = repository()
        repository.refreshLinks()

        val lowered = (repository.lower("u1", RelationLevel.FRIEND) as NetworkResult.Success).data

        assertThat(lowered.effectiveLevel).isEqualTo(RelationLevel.FRIEND)
        assertThat(repository.cachedLinks()?.associate { it.userId to it.effectiveLevel })
            .containsExactly("u1", RelationLevel.FRIEND, "u2", RelationLevel.FRIEND)
    }

    @Test
    fun `annuler le lien retire la personne du cache des cercles et de l'amitie`() = runTest {
        coEvery { api.links() } returns ApiResponse(success = true, data = listOf(friendLink))
        coEvery { api.lower("u1", RelationLowerBody("PUBLIC")) } returns
            ApiResponse(success = true, data = friendLink.copy(effectiveLevel = "PUBLIC", grantedByMe = "PUBLIC"))
        val friendship = FriendshipCache().apply { didAcceptRequest("u1") }
        val repository = repository(friendship)
        repository.refreshLinks()

        repository.lower("u1", RelationLevel.PUBLIC)

        assertThat(repository.cachedLinks()).isEmpty()
        assertThat(friendship.isFriend("u1")).isFalse()
    }

    @Test
    fun `un refus de la passerelle remonte type et laisse le cache intact`() = runTest {
        coEvery { api.links() } returns ApiResponse(success = true, data = listOf(friendLink))
        coEvery { api.lower("u1", any()) } returns
            ApiResponse(success = false, error = "Une montée se demande", code = "RELATION_NOT_A_DROP")
        val repository = repository()
        repository.refreshLinks()

        val outcome = repository.lower("u1", RelationLevel.ACQUAINTANCE)

        assertThat((outcome as NetworkResult.Failure).error.code).isEqualTo("RELATION_NOT_A_DROP")
        assertThat(repository.cachedLinks()?.single()?.effectiveLevel).isEqualTo(RelationLevel.FRIEND)
    }

    @Test
    fun `le verrou de remontee se lit sur relations userId, et une panne ne verrouille rien`() = runTest {
        coEvery { api.byUserId("u1") } returns ApiResponse(
            success = true,
            data = RelationLevelResponse("u1", "FRIEND", canRaise = false, raiseBlockedUntil = "2026-12-01T00:00:00Z"),
        )
        coEvery { api.byUserId("u2") } throws IOException("offline")

        assertThat(repository().raiseGate("u1")).isEqualTo(RelationRaiseGate(false, "2026-12-01T00:00:00Z"))
        assertThat(repository().raiseGate("u2")).isNull()
    }

    @Test
    fun `le niveau des outils servi entre deux comptes de l'equipe se lit, un niveau illisible se lit Public`() = runTest {
        coEvery { api.byUserId("u1") } returns ApiResponse(
            success = true,
            data = RelationLevelResponse("u1", "PUBLIC", accessLevel = "BLOOD"),
        )
        coEvery { api.byUserId("u2") } returns ApiResponse(
            success = true,
            data = RelationLevelResponse("u2", "PUBLIC", accessLevel = "ATOM"),
        )
        coEvery { api.byUserId("u3") } returns ApiResponse(success = true, data = RelationLevelResponse("u3", "PUBLIC"))

        assertThat(repository().raiseGate("u1")?.accessLevel).isEqualTo(RelationLevel.BLOOD)
        assertThat(repository().raiseGate("u2")?.accessLevel).isEqualTo(RelationLevel.PUBLIC)
        assertThat(repository().raiseGate("u3")?.accessLevel).isNull()
    }
}
