package me.meeshy.sdk.status

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.StatusBarCacheEntity
import me.meeshy.sdk.model.StatusEntry
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class StatusBarCacheRepositoryTest {

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

    private fun repository() = StatusBarCacheRepository(db.statusBarCacheDao())

    private fun entry(id: String, emoji: String = "😀") =
        StatusEntry(id = id, userId = "u-$id", moodEmoji = emoji)

    private val friendsBar = listOf(entry("a"), entry("b", "🎉"))

    @Test
    fun `cachedBar is null on a cold cache`() = runTest {
        assertThat(repository().cachedBar(StatusFeedMode.FRIENDS)).isNull()
    }

    @Test
    fun `persistBar then cachedBar round-trips the feed in order`() = runTest {
        val repo = repository()

        repo.persistBar(StatusFeedMode.FRIENDS, friendsBar)

        assertThat(repo.cachedBar(StatusFeedMode.FRIENDS)).containsExactlyElementsIn(friendsBar).inOrder()
    }

    @Test
    fun `cachedBar is keyed per mode - the friends bar never leaks into discover`() = runTest {
        val repo = repository()

        repo.persistBar(StatusFeedMode.FRIENDS, friendsBar)

        assertThat(repo.cachedBar(StatusFeedMode.FRIENDS)).containsExactlyElementsIn(friendsBar).inOrder()
        assertThat(repo.cachedBar(StatusFeedMode.DISCOVER)).isNull()
    }

    @Test
    fun `the two feeds persist independently in the same table`() = runTest {
        val repo = repository()
        val discoverBar = listOf(entry("x", "🔥"))

        repo.persistBar(StatusFeedMode.FRIENDS, friendsBar)
        repo.persistBar(StatusFeedMode.DISCOVER, discoverBar)

        assertThat(repo.cachedBar(StatusFeedMode.FRIENDS)).containsExactlyElementsIn(friendsBar).inOrder()
        assertThat(repo.cachedBar(StatusFeedMode.DISCOVER)).containsExactlyElementsIn(discoverBar).inOrder()
    }

    @Test
    fun `persistBar overwrites the previous bar for the same mode - newest wins`() = runTest {
        val repo = repository()

        repo.persistBar(StatusFeedMode.FRIENDS, friendsBar)
        val newer = listOf(entry("c", "🥳"))
        repo.persistBar(StatusFeedMode.FRIENDS, newer)

        assertThat(repo.cachedBar(StatusFeedMode.FRIENDS)).containsExactlyElementsIn(newer).inOrder()
    }

    @Test
    fun `an empty persisted bar reads back as synced-empty, not cold`() = runTest {
        val repo = repository()

        repo.persistBar(StatusFeedMode.FRIENDS, emptyList())

        // synced-but-empty: a real "no moods" feed, distinct from the cold `null`.
        assertThat(repo.cachedBar(StatusFeedMode.FRIENDS)).isEqualTo(emptyList<StatusEntry>())
    }

    @Test
    fun `invalidate drops the persisted bar for that mode only`() = runTest {
        val repo = repository()
        val discoverBar = listOf(entry("x"))
        repo.persistBar(StatusFeedMode.FRIENDS, friendsBar)
        repo.persistBar(StatusFeedMode.DISCOVER, discoverBar)

        repo.invalidate(StatusFeedMode.FRIENDS)

        assertThat(repo.cachedBar(StatusFeedMode.FRIENDS)).isNull()
        assertThat(repo.cachedBar(StatusFeedMode.DISCOVER)).containsExactlyElementsIn(discoverBar).inOrder()
    }

    @Test
    fun `cachedBar returns null when the stored payload cannot be decoded`() = runTest {
        val repo = repository()
        db.statusBarCacheDao().upsert(
            StatusBarCacheEntity(
                cacheKey = StatusBarCacheRepository.barKey(StatusFeedMode.FRIENDS),
                payload = "}{ not json",
                cachedAt = 0L,
            ),
        )

        assertThat(repo.cachedBar(StatusFeedMode.FRIENDS)).isNull()
    }

    @Test
    fun `the round-trip preserves rich entry fields, not just ids`() = runTest {
        val repo = repository()
        val rich = StatusEntry(
            id = "s1",
            userId = "u1",
            username = "alice",
            avatarColor = "#FF0000",
            moodEmoji = "🎯",
            content = "focused",
            reactionSummary = mapOf("👍" to 3, "🔥" to 1),
            viaUsername = "bob",
        )

        repo.persistBar(StatusFeedMode.DISCOVER, listOf(rich))

        assertThat(repo.cachedBar(StatusFeedMode.DISCOVER)).containsExactly(rich)
    }
}
