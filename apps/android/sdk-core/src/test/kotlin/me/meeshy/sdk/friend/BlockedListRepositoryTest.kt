package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.friend.BlockedUser
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BlockedListRepositoryTest {

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
        BlockedListRepository(db, db.blockedUserDao(), db.syncMetaDao())

    private fun user(id: String, username: String = id, displayName: String? = null) =
        BlockedUser(id = id, username = username, displayName = displayName)

    @Test
    fun `cachedSnapshot is null on a cold cache`() = runTest {
        assertThat(repository().cachedSnapshot()).isNull()
    }

    @Test
    fun `persist then cachedSnapshot returns the blocked users in the persisted order`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("u1"), user("u2")))

        assertThat(repo.cachedSnapshot()?.map { it.id }).containsExactly("u1", "u2").inOrder()
    }

    @Test
    fun `cachedSnapshot round-trips the full blocked user payload`() = runTest {
        val repo = repository()
        val rich = user("u1", username = "u1_w", displayName = "U One")

        repo.persist(listOf(rich))

        assertThat(repo.cachedSnapshot()).containsExactly(rich)
    }

    @Test
    fun `persist drops blocked users absent from the latest list`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("u1"), user("u2")))
        repo.persist(listOf(user("u2")))

        assertThat(repo.cachedSnapshot()?.map { it.id }).containsExactly("u2")
    }

    @Test
    fun `persisting an empty list is a synced-empty cache, not a cold one`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("u1")))
        repo.persist(emptyList())

        assertThat(repo.cachedSnapshot()).isEqualTo(emptyList<BlockedUser>())
    }

    @Test
    fun `cachedSnapshot reflects only the newest persisted roster after several writes`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("a"), user("b"), user("c")))
        repo.persist(listOf(user("c"), user("a")))

        assertThat(repo.cachedSnapshot()?.map { it.id }).containsExactly("c", "a").inOrder()
    }
}
