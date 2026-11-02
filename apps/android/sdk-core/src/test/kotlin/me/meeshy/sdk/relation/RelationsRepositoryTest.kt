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
import me.meeshy.sdk.net.api.RelationsApi
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
}
