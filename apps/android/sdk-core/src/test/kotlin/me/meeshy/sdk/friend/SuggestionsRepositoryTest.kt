package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.SuggestionEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SuggestionsRepositoryTest {

    private val userRepository: UserRepository = mockk()
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

    private fun user(id: String) = UserSearchResult(id = id, username = id)

    private class FixedClock(private val now: Long) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun source(clock: CacheClock = FixedClock(1_000L)) =
        RoomSuggestionsSource(db, db.suggestionDao(), db.syncMetaDao(), userRepository, clock)

    private fun repository() =
        SuggestionsRepository(db, db.suggestionDao(), db.syncMetaDao(), userRepository)

    // ── RoomSuggestionsSource ────────────────────────────────────────────────

    @Test
    fun `revalidate fetches the empty-query list and records the sync time`() = runTest {
        val users = listOf(user("alice"), user("bob"))
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Success(users)
        val source = source(FixedClock(1_234L))

        source.revalidate()

        assertThat(source.observe().first()).isEqualTo(users)
        assertThat(source.lastSyncedAt().first()).isEqualTo(1_234L)
    }

    @Test
    fun `revalidate preserves the gateway ranking order via sortIndex`() = runTest {
        // Insertion order deliberately not alphabetical — the gateway's ranking is
        // the SSOT and must round-trip, never be re-sorted by SQL.
        val ranked = listOf(user("zoe"), user("amy"), user("mike"))
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Success(ranked)

        source().revalidate()

        assertThat(db.suggestionDao().observeAll().first().map { it.userId })
            .containsExactly("zoe", "amy", "mike").inOrder()
        assertThat(source().observe().first()).isEqualTo(ranked)
    }

    @Test
    fun `observe is null on a cold cache before any sync`() = runTest {
        assertThat(source().observe().first()).isNull()
        assertThat(source().lastSyncedAt().first()).isNull()
    }

    @Test
    fun `a synced-but-empty list reads back as empty content, not a cold cache`() = runTest {
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Success(emptyList())

        source().revalidate()

        // Empty list (not null) → the surface renders a real "no one to suggest",
        // distinct from a cold spinner.
        assertThat(source().observe().first()).isEqualTo(emptyList<UserSearchResult>())
        assertThat(source().lastSyncedAt().first()).isNotNull()
    }

    @Test
    fun `revalidate drops rows absent from the latest sync`() = runTest {
        coEvery { userRepository.searchUsers("", 20, 0) } returnsMany listOf(
            NetworkResult.Success(listOf(user("alice"), user("bob"))),
            NetworkResult.Success(listOf(user("bob"))),
        )
        val source = source()

        source.revalidate()
        source.revalidate()

        assertThat(source.observe().first()).isEqualTo(listOf(user("bob")))
    }

    @Test
    fun `a later empty sync clears a previously populated cache`() = runTest {
        coEvery { userRepository.searchUsers("", 20, 0) } returnsMany listOf(
            NetworkResult.Success(listOf(user("alice"))),
            NetworkResult.Success(emptyList()),
        )
        val source = source()

        source.revalidate()
        source.revalidate()

        assertThat(source.observe().first()).isEqualTo(emptyList<UserSearchResult>())
    }

    @Test
    fun `a cold revalidation failure throws and leaves the cache cold`() = runTest {
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Failure(ApiError("boom"))
        val source = source()

        val thrown = runCatching { source.revalidate() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(SuggestionsSyncException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("boom")
        assertThat(source.observe().first()).isNull()
        assertThat(source.lastSyncedAt().first()).isNull()
    }

    @Test
    fun `a failed revalidation keeps the previously cached list`() = runTest {
        val users = listOf(user("alice"))
        coEvery { userRepository.searchUsers("", 20, 0) } returnsMany listOf(
            NetworkResult.Success(users),
            NetworkResult.Failure(ApiError("down")),
        )
        val source = source(FixedClock(7L))
        source.revalidate()

        runCatching { source.revalidate() }

        assertThat(source.observe().first()).isEqualTo(users)
        assertThat(source.lastSyncedAt().first()).isEqualTo(7L)
    }

    // ── SuggestionsRepository (SWR wiring) ───────────────────────────────────

    @Test
    fun `suggestionsStream emits Empty then paints the fetched suggestions`() = runTest {
        val users = listOf(user("carol"), user("dan"))
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Success(users)

        repository().suggestionsStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            // A live revalidate can flip through a transient Syncing frame while the
            // two backing Room flows (rows + sync_meta) settle; drain until the
            // fetched list actually paints (the behaviour that matters).
            var painted = awaitItem()
            while (painted.valueOrNull != users) painted = awaitItem()
            assertThat(painted.valueOrNull).isEqualTo(users)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `suggestionsStream paints instantly from a pre-seeded cache without a cold Empty`() = runTest {
        // Simulate a fresh process (cold launch) whose Room already holds the last
        // synced suggestions — the whole point of the durable cache: no spinner.
        val cached = listOf(user("eve"), user("finn"))
        seedCache(cached, syncedAt = 5_000L)
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Success(cached)

        val first = repository().suggestionsStream().first()

        assertThat(first).isNotEqualTo(CacheResult.Empty)
        assertThat(first.valueOrNull).isEqualTo(cached)
    }

    @Test
    fun `suggestionsStream reports a cold failure through onSyncError`() = runTest {
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Failure(ApiError("offline"))
        val errors = mutableListOf<Throwable>()

        repository().suggestionsStream(onSyncError = { errors += it }).test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            cancelAndIgnoreRemainingEvents()
        }

        assertThat(errors).hasSize(1)
        assertThat(errors.single()).hasMessageThat().isEqualTo("offline")
    }

    private suspend fun seedCache(users: List<UserSearchResult>, syncedAt: Long) {
        db.suggestionDao().upsertAll(
            users.mapIndexed { index, u ->
                SuggestionEntity(
                    userId = u.id,
                    payload = MeeshyApi.json.encodeToString(u),
                    sortIndex = index,
                    cachedAt = syncedAt,
                )
            },
        )
        db.syncMetaDao().upsert(SyncMetaEntity(RoomSuggestionsSource.RESOURCE_KEY, syncedAt))
    }
}
