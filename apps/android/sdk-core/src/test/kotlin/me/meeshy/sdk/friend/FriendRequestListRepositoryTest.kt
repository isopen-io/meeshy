package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.FriendRequestEntity
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FriendRequestListRepositoryTest {

    private lateinit var db: MeeshyDatabase

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

    private fun repository() =
        FriendRequestListRepository(db, db.friendRequestDao(), db.syncMetaDao())

    private fun request(id: String, senderId: String = "", receiverId: String = "", status: String = "pending") =
        FriendRequest(id = id, senderId = senderId, receiverId = receiverId, status = status)

    @Test
    fun `cachedReceived and cachedSent are null on a cold cache`() = runTest {
        val repo = repository()

        assertThat(repo.cachedReceived()).isNull()
        assertThat(repo.cachedSent()).isNull()
    }

    @Test
    fun `persistReceived then cachedReceived returns the requests in the persisted order`() = runTest {
        val repo = repository()

        repo.persistReceived(listOf(request("r1"), request("r2")))

        assertThat(repo.cachedReceived()?.map { it.id }).containsExactly("r1", "r2").inOrder()
    }

    @Test
    fun `persistSent then cachedSent returns the requests in the persisted order`() = runTest {
        val repo = repository()

        repo.persistSent(listOf(request("s1"), request("s2")))

        assertThat(repo.cachedSent()?.map { it.id }).containsExactly("s1", "s2").inOrder()
    }

    @Test
    fun `received and sent are independent caches sharing no rows`() = runTest {
        val repo = repository()

        repo.persistReceived(listOf(request("r1")))
        repo.persistSent(listOf(request("s1")))

        assertThat(repo.cachedReceived()?.map { it.id }).containsExactly("r1")
        assertThat(repo.cachedSent()?.map { it.id }).containsExactly("s1")
    }

    @Test
    fun `cachedReceived round-trips the full request payload`() = runTest {
        val repo = repository()
        val rich = request("r1", senderId = "alice", receiverId = "bob", status = "pending")

        repo.persistReceived(listOf(rich))

        assertThat(repo.cachedReceived()).containsExactly(rich)
    }

    @Test
    fun `persistReceived drops requests absent from the latest list`() = runTest {
        val repo = repository()

        repo.persistReceived(listOf(request("r1"), request("r2")))
        repo.persistReceived(listOf(request("r2")))

        assertThat(repo.cachedReceived()?.map { it.id }).containsExactly("r2")
    }

    @Test
    fun `persisting an empty received list is a synced-empty cache, not a cold one`() = runTest {
        val repo = repository()

        repo.persistReceived(listOf(request("r1")))
        repo.persistReceived(emptyList())

        assertThat(repo.cachedReceived()).isEqualTo(emptyList<FriendRequest>())
    }

    @Test
    fun `persisting an empty sent list is a synced-empty cache, not a cold one`() = runTest {
        val repo = repository()

        repo.persistSent(listOf(request("s1")))
        repo.persistSent(emptyList())

        assertThat(repo.cachedSent()).isEqualTo(emptyList<FriendRequest>())
    }

    // --- Le contour d'avatar servi avec la personne ------------------------

    @Test
    fun `a person's equipped avatar ring survives the cold-start replay`() = runTest {
        val repo = repository()
        val ring = buildJsonObject {
            put("avatarRing", buildJsonObject { put("pack", "neon"); put("item", "pulse") })
        }
        val withRing = FriendRequest(
            id = "r1",
            status = "pending",
            sender = FriendRequestUser(id = "alice", username = "alice", profileDecor = ring),
        )

        repo.persistReceived(listOf(withRing))

        assertThat(repo.cachedReceived()).containsExactly(withRing)
        assertThat(repo.cachedReceived()!!.single().sender!!.profileDecor).isEqualTo(ring)
    }

    @Test
    fun `a row cached before the decor field existed still replays`() = runTest {
        db.friendRequestDao().upsertAll(
            listOf(
                FriendRequestEntity(
                    id = "old",
                    direction = FriendRequestListRepository.DIRECTION_RECEIVED,
                    payload = """{"id":"old","status":"pending","sender":{"id":"u1","username":"alice"}}""",
                    sortIndex = 0,
                    cachedAt = 1L,
                ),
            ),
        )

        val replayed = repository().cachedReceived()

        assertThat(replayed!!.single().sender!!.profileDecor).isNull()
        assertThat(replayed.single().sender!!.username).isEqualTo("alice")
    }
}
