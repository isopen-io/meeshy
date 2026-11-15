package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.builtins.serializer
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.KeyedJsonCacheSource
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.friend.BlockedListRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRequestListRepository
import me.meeshy.sdk.friend.RoomSuggestionsSource
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.PublicProfile
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.profile.ProfileLoadSideEffects
import me.meeshy.sdk.profile.ProfileRemote
import me.meeshy.sdk.profile.ProfileSheetLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.profile.ProfileCacheRepository
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.withAccountTicket
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13560 — the private caches beyond conversations and messages: a write of account A taken under A's ticket never
 * lands once A has signed out and B signed in. Each race is FORCED (ticket taken, A leaves, then the write), the
 * response that fed it being out of the picture.
 */
@RunWith(RobolectricTestRunner::class)
class AccountPrivateCacheWriteRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private suspend fun signOutThenSignInAsB() {
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
    }

    private fun keyed() = KeyedJsonCache(db.keyedJsonCacheDao(), clock, fence)

    @Test
    fun `a keyed document fetched for A and written after A signed out never lands in B's cache`(): Unit = runBlocking {
        val cache = keyed()
        val source = KeyedJsonCacheSource(cache, "community:list", "page0", String.serializer()) {
            signOutThenSignInAsB()
            "communautes-de-A"
        }

        source.revalidate()

        assertThat(cache.get("community:list", "page0", String.serializer())).isNull()
    }

    @Test
    fun `a keyed document fetched while A is still signed in lands`(): Unit = runBlocking {
        val cache = keyed()

        KeyedJsonCacheSource(cache, "community:list", "page0", String.serializer()) { "communautes-de-A" }.revalidate()

        assertThat(cache.get("community:list", "page0", String.serializer())?.value).isEqualTo("communautes-de-A")
    }

    @Test
    fun `a profile stored under A's ticket after A signed out is not kept for B`(): Unit = runBlocking {
        val profiles = ProfileCacheRepository(keyed())
        val ticket = profiles.ticket()
        signOutThenSignInAsB()

        profiles.store(MeeshyUser(id = "u-de-A", username = "alice"), "alice", ticket)

        assertThat(profiles.cachedProfile("alice")).isNull()
        assertThat(profiles.cachedProfile("u-de-A")).isNull()
    }

    @Test
    fun `profile stats persisted under A's ticket after A signed out are not kept for B`(): Unit = runBlocking {
        val stats = ProfileStatsCacheRepository(db.profileStatsCacheDao(), fence)
        val ticket = stats.ticket()
        signOutThenSignInAsB()

        stats.persistStats("u-de-A", UserStats(totalMessages = 9), ticket)
        stats.persistTimeline("u-de-A", emptyList(), ticket)

        assertThat(stats.cachedStats("u-de-A")).isNull()
        assertThat(stats.cachedTimeline("u-de-A")).isNull()
    }

    @Test
    fun `a friend roster persisted under A's ticket after A signed out is not kept for B`(): Unit = runBlocking {
        val friends = FriendListRepository(db, db.friendDao(), db.syncMetaDao(), fence)
        val ticket = friends.ticket()
        signOutThenSignInAsB()

        friends.persist(listOf(FriendRequestUser(id = "ami-de-A", username = "ami")), ticket)

        assertThat(friends.cachedSnapshot()).isNull()
    }
    @Test
    fun `a profile sheet whose answer arrives after A signed out keeps neither the profile nor its stats`(): Unit =
        runBlocking {
            val profiles = ProfileCacheRepository(keyed())
            val stats = ProfileStatsCacheRepository(db.profileStatsCacheDao(), fence)
            val alice = MeeshyUser(id = "u-de-A", username = "alice")
            val remote = object : ProfileRemote {
                override suspend fun profile(handle: String): NetworkResult<PublicProfile> {
                    signOutThenSignInAsB()
                    return NetworkResult.Success(PublicProfile(alice, UserStats(totalMessages = 3)))
                }
                override suspend fun stats(userId: String): NetworkResult<UserStats> = error("not reached")
            }

            ProfileSheetLoader(profiles, stats, remote, ProfileLoadSideEffects(emptyList())).open("u-de-A", "alice").toList()

            assertThat(profiles.cachedProfile("u-de-A")).isNull()
            assertThat(profiles.cachedProfile("alice")).isNull()
            assertThat(stats.cachedStats("u-de-A")).isNull()
        }

    @Test
    fun `a roster fetched for A and answered after A signed out is not kept for B`(): Unit = runBlocking {
        val cache = keyed()
        val roster = ParticipantCacheRepository(
            cache = cache,
            fetchPage = { _, _, _ ->
                signOutThenSignInAsB()
                NetworkResult.Success(
                    MemberRosterPage(listOf(PaginatedParticipant(id = "p", userId = "membre-de-A", displayName = "m")), null, false, 1),
                )
            },
            scope = CoroutineScope(Dispatchers.Unconfined),
            clock = clock,
        )

        roster.firstPage("conv-de-A")

        assertThat(cache.get("participants", "conv-de-A", me.meeshy.sdk.model.MemberRoster.serializer())).isNull()
    }
    @Test
    fun `a friend accepted by A and injected after B signed in never joins B's roster`(): Unit = runBlocking {
        val friends = FriendListRepository(db, db.friendDao(), db.syncMetaDao(), fence)
        val acceptedByA = fence.ticket()
        signOutThenSignInAsB()
        friends.persist(listOf(FriendRequestUser(id = "ami-de-B", username = "b")), friends.ticket())

        withAccountTicket(acceptedByA) { friends.insertAtHead(FriendRequestUser(id = "ami-de-A", username = "a")) }

        assertThat(friends.cachedSnapshot()?.map { it.id }).containsExactly("ami-de-B")
    }

    @Test
    fun `friend requests persisted under A's ticket after A signed out are not kept for B`(): Unit = runBlocking {
        val requests = FriendRequestListRepository(db, db.friendRequestDao(), db.syncMetaDao(), fence)
        val ticket = requests.ticket()
        signOutThenSignInAsB()

        requests.persistReceived(listOf(FriendRequest(id = "r-de-A", senderId = "x", receiverId = "A", status = "pending")), ticket)
        requests.persistSent(listOf(FriendRequest(id = "s-de-A", senderId = "A", receiverId = "x", status = "pending")), ticket)

        assertThat(requests.cachedReceived()).isNull()
        assertThat(requests.cachedSent()).isNull()
    }

    @Test
    fun `a blocklist persisted under A's ticket after A signed out is not kept for B`(): Unit = runBlocking {
        val blocked = BlockedListRepository(db, db.blockedUserDao(), db.syncMetaDao(), fence)
        val ticket = blocked.ticket()
        signOutThenSignInAsB()

        blocked.persist(listOf(BlockedUser(id = "bloque-par-A", username = "b")), ticket)

        assertThat(blocked.cachedSnapshot()).isNull()
    }

    @Test
    fun `suggestions fetched for A and answered after A signed out are not kept for B`(): Unit = runBlocking {
        val users: UserRepository = mockk()
        coEvery { users.searchUsers("", 20, 0) } coAnswers {
            signOutThenSignInAsB()
            NetworkResult.Success(listOf(UserSearchResult(id = "suggere-a-A", username = "s")))
        }
        val source = RoomSuggestionsSource(db, db.suggestionDao(), db.syncMetaDao(), users, clock, fence)

        source.revalidate()

        assertThat(db.suggestionDao().observeAll().first()).isEmpty()
    }
}
