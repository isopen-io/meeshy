package me.meeshy.sdk.user

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ProfileStatsCacheEntity
import me.meeshy.sdk.model.Achievement
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UserStats
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProfileStatsCacheRepositoryTest {

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

    private fun repository() = ProfileStatsCacheRepository(db.profileStatsCacheDao())

    private val richStats = UserStats(
        totalMessages = 42,
        totalConversations = 7,
        totalTranslations = 12,
        friendRequestsReceived = 3,
        languagesUsed = 2,
        memberDays = 100,
        languages = listOf("fr", "en"),
        achievements = listOf(
            Achievement(id = "a1", name = "First Message", isUnlocked = true, threshold = 1, current = 42),
        ),
    )

    private val timeline = listOf(
        TimelinePoint(date = "2026-07-01", messages = 4),
        TimelinePoint(date = "2026-07-02", messages = 8),
        TimelinePoint(date = "2026-07-03", messages = 0),
    )

    // --- stats ---

    @Test
    fun `cachedStats is null on a cold cache`() = runTest {
        assertThat(repository().cachedStats("me")).isNull()
    }

    @Test
    fun `persistStats then cachedStats round-trips the full payload`() = runTest {
        val repo = repository()

        repo.persistStats("me", richStats)

        assertThat(repo.cachedStats("me")).isEqualTo(richStats)
    }

    @Test
    fun `cachedStats is keyed per user - one user's stats never leak into another's`() = runTest {
        val repo = repository()

        repo.persistStats("alice", richStats)

        assertThat(repo.cachedStats("alice")).isEqualTo(richStats)
        assertThat(repo.cachedStats("bob")).isNull()
    }

    @Test
    fun `persistStats overwrites the previous stats for the same user - newest wins`() = runTest {
        val repo = repository()

        repo.persistStats("me", richStats)
        val updated = richStats.copy(totalMessages = 99)
        repo.persistStats("me", updated)

        assertThat(repo.cachedStats("me")).isEqualTo(updated)
    }

    @Test
    fun `cachedStats returns null when the stored payload cannot be decoded`() = runTest {
        val repo = repository()
        db.profileStatsCacheDao().upsert(
            ProfileStatsCacheEntity(
                cacheKey = ProfileStatsCacheRepository.statsKey("me"),
                payload = "}{ not json",
                cachedAt = 0L,
            ),
        )

        assertThat(repo.cachedStats("me")).isNull()
    }

    // --- timeline ---

    @Test
    fun `cachedTimeline is null on a cold cache`() = runTest {
        assertThat(repository().cachedTimeline()).isNull()
    }

    @Test
    fun `persistTimeline then cachedTimeline round-trips the points in order`() = runTest {
        val repo = repository()

        repo.persistTimeline(timeline)

        assertThat(repo.cachedTimeline()).containsExactlyElementsIn(timeline).inOrder()
    }

    @Test
    fun `an empty persisted timeline reads back as synced-empty, not cold`() = runTest {
        val repo = repository()

        repo.persistTimeline(emptyList())

        // synced-but-empty: a real "no activity" window, distinct from the cold `null`.
        assertThat(repo.cachedTimeline()).isEqualTo(emptyList<TimelinePoint>())
    }

    @Test
    fun `persistTimeline overwrites the previous window - newest wins`() = runTest {
        val repo = repository()

        repo.persistTimeline(timeline)
        val newer = listOf(TimelinePoint(date = "2026-07-04", messages = 5))
        repo.persistTimeline(newer)

        assertThat(repo.cachedTimeline()).containsExactlyElementsIn(newer).inOrder()
    }

    @Test
    fun `cachedTimeline returns null when the stored payload cannot be decoded`() = runTest {
        val repo = repository()
        db.profileStatsCacheDao().upsert(
            ProfileStatsCacheEntity(
                cacheKey = ProfileStatsCacheRepository.TIMELINE_KEY,
                payload = "not-an-array",
                cachedAt = 0L,
            ),
        )

        assertThat(repo.cachedTimeline()).isNull()
    }

    @Test
    fun `stats and timeline share the table without colliding`() = runTest {
        val repo = repository()

        repo.persistStats("me", richStats)
        repo.persistTimeline(timeline)

        assertThat(repo.cachedStats("me")).isEqualTo(richStats)
        assertThat(repo.cachedTimeline()).containsExactlyElementsIn(timeline).inOrder()
    }
}
