package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.FriendRequestUser
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FriendListRepositoryTest {

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
        FriendListRepository(db, db.friendDao(), db.syncMetaDao())

    private fun user(
        id: String,
        username: String = id,
        displayName: String? = null,
        isOnline: Boolean? = null,
        lastActiveAt: String? = null,
    ) = FriendRequestUser(
        id = id,
        username = username,
        displayName = displayName,
        isOnline = isOnline,
        lastActiveAt = lastActiveAt,
    )

    @Test
    fun `cachedSnapshot is null on a cold cache`() = runTest {
        assertThat(repository().cachedSnapshot()).isNull()
    }

    @Test
    fun `persist then cachedSnapshot returns the friends in the persisted order`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("online", isOnline = true), user("offline", isOnline = false)))

        assertThat(repo.cachedSnapshot()?.map { it.id }).containsExactly("online", "offline").inOrder()
    }

    @Test
    fun `cachedSnapshot preserves the assembled order verbatim, not a SQL re-sort`() = runTest {
        val repo = repository()
        // An order a naive online/lastActive SQL sort would NOT reproduce: an
        // offline contact deliberately placed ahead of an online one. The DAO must
        // honour ContactList's sortIndex, not re-derive an order of its own.
        val assembled = listOf(
            user("b", isOnline = false, lastActiveAt = "2026-01-01T00:00:00Z"),
            user("a", isOnline = true, lastActiveAt = "2020-01-01T00:00:00Z"),
        )

        repo.persist(assembled)

        assertThat(repo.cachedSnapshot()?.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `cachedSnapshot round-trips the full friend payload`() = runTest {
        val repo = repository()
        val rich = user(
            "alice",
            username = "alice_w",
            displayName = "Alice W.",
            isOnline = true,
            lastActiveAt = "2026-06-01T12:00:00Z",
        )

        repo.persist(listOf(rich))

        assertThat(repo.cachedSnapshot()).containsExactly(rich)
    }

    @Test
    fun `persist drops friends absent from the latest list`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("alice"), user("bob")))
        repo.persist(listOf(user("bob")))

        assertThat(repo.cachedSnapshot()?.map { it.id }).containsExactly("bob")
    }

    @Test
    fun `persisting an empty list is a synced-empty cache, not a cold one`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("alice")))
        repo.persist(emptyList())

        // synced-but-empty: a real empty roster, distinct from the cold `null`.
        assertThat(repo.cachedSnapshot()).isEqualTo(emptyList<FriendRequestUser>())
    }

    @Test
    fun `cachedSnapshot reflects only the newest persisted roster after several writes`() = runTest {
        val repo = repository()

        repo.persist(listOf(user("a"), user("b"), user("c")))
        repo.persist(listOf(user("c"), user("a")))

        assertThat(repo.cachedSnapshot()?.map { it.id }).containsExactly("c", "a").inOrder()
    }

    @Test
    fun `friend rows are observable through the dao ordered by sortIndex`() = runTest {
        val repo = repository()
        repo.persist(listOf(user("first"), user("second")))

        val rows = db.friendDao().observeAll().first()

        assertThat(rows.map { it.userId }).containsExactly("first", "second").inOrder()
        assertThat(rows.map { it.sortIndex }).containsExactly(0, 1).inOrder()
    }
}
