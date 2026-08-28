package me.meeshy.sdk.category

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.model.ApiCategory
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.CreateCategoryBody
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import org.junit.Test

/**
 * Behavioural coverage of the cache-first category hydration: the
 * [CategoryCacheSource] (network → snapshot persistence) and the
 * [CategoryRepository] stream that flattens the SWR verdict to the plain catalogue
 * the section splitter consumes. Fakes stand in for the gateway; the snapshot store
 * is the in-memory variant. Expectations are hand-written literals.
 */
class CategoryRepositoryTest {

    private class FixedClock(private val now: Long) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private class FakePreferencesApi(
        var response: ApiResponse<List<ApiCategory>>,
        var createResponse: ApiResponse<ApiCategory> = ApiResponse(success = false, error = "not stubbed"),
    ) : PreferencesApi {
        var calls: Int = 0
        var createCalls: Int = 0
        var lastCreateBody: CreateCategoryBody? = null

        override suspend fun getCategories(limit: Int?): ApiResponse<List<ApiCategory>> {
            calls++
            return response
        }

        override suspend fun createCategory(body: CreateCategoryBody): ApiResponse<ApiCategory> {
            createCalls++
            lastCreateBody = body
            return createResponse
        }

        override suspend fun updateNotification(body: NotificationPreferenceSyncBody) =
            ApiResponse(success = true, data = Unit)

        override suspend fun updatePrivacy(body: PrivacyPreferenceSyncBody) =
            ApiResponse(success = true, data = Unit)

        // Les deux lectures ajoutees au cycle 131 (#4133). Ce double n'a rien a voir avec
        // elles : il refuse, ce qui ferait tomber tout test de categories qui les
        // atteindrait par erreur. Comme les quatre doubles de `ConversationApi`, celui-ci
        // implemente l'interface A LA MAIN — chaque route ajoutee est donc un inventaire a
        // tenir, et le compilateur est le seul a s'en souvenir.
        override suspend fun getNotification() =
            ApiResponse<NotificationPreferenceSyncBody>(success = false, error = "not stubbed")

        override suspend fun getPrivacy() =
            ApiResponse<PrivacyPreferenceSyncBody>(success = false, error = "not stubbed")
    }

    private fun ok(vararg categories: ApiCategory) =
        ApiResponse(success = true, data = categories.toList())

    private fun wire(id: String, name: String, order: Int? = null) =
        ApiCategory(id = id, name = name, color = "#123456", icon = "star", order = order, isExpanded = true)

    // ── CategoryCacheSource ──────────────────────────────────────────────────

    @Test
    fun `revalidate fetches, narrows render-only fields and records the sync time`() = runTest {
        val api = FakePreferencesApi(ok(wire("work", "Work", order = 1), wire("fam", "Family", order = 0)))
        val store = InMemoryCategorySnapshotStore()
        val source = CategoryCacheSource(store, api, FixedClock(4_242L))

        source.revalidate()

        assertThat(source.observe().first()).containsExactly(
            CategoryOption(id = "work", name = "Work", order = 1),
            CategoryOption(id = "fam", name = "Family", order = 0),
        ).inOrder()
        assertThat(source.lastSyncedAt().first()).isEqualTo(4_242L)
    }

    @Test
    fun `observe is null on a cold cache before any sync`() = runTest {
        val source = CategoryCacheSource(InMemoryCategorySnapshotStore(), FakePreferencesApi(ok()), FixedClock(1L))

        assertThat(source.observe().first()).isNull()
        assertThat(source.lastSyncedAt().first()).isNull()
    }

    @Test
    fun `a synced-but-empty catalogue reads back as empty content, not a cold cache`() = runTest {
        val store = InMemoryCategorySnapshotStore()
        val source = CategoryCacheSource(store, FakePreferencesApi(ok()), FixedClock(9L))

        source.revalidate()

        assertThat(source.observe().first()).isEqualTo(emptyList<CategoryOption>())
        assertThat(source.lastSyncedAt().first()).isEqualTo(9L)
    }

    @Test
    fun `revalidate throws CategorySyncException on an API failure`() = runTest {
        val api = FakePreferencesApi(ApiResponse(success = false, error = "boom"))
        val source = CategoryCacheSource(InMemoryCategorySnapshotStore(), api, FixedClock(1L))

        val thrown = runCatching { source.revalidate() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(CategorySyncException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("boom")
    }

    // ── CategoryRepository stream ────────────────────────────────────────────

    private fun repository(
        api: PreferencesApi,
        store: CategorySnapshotStore,
        clock: CacheClock = FixedClock(1_000L),
    ) = CategoryRepository(api, store, clock)

    @Test
    fun `stream serves a warm fresh cache immediately without hitting the network`() = runTest {
        val api = FakePreferencesApi(ok(wire("net", "Network")))
        // Seeded at the same instant as the clock → age 0 → Fresh → no revalidation.
        val store = InMemoryCategorySnapshotStore(
            initial = listOf(CategoryOption(id = "cached", name = "Cached", order = 0)),
            initialSyncedAt = 1_000L,
        )

        val first = repository(api, store).categoriesStream(policy = CachePolicy.Default).first()

        assertThat(first.map { it.id }).containsExactly("cached")
        assertThat(api.calls).isEqualTo(0)
    }

    @Test
    fun `stream on a cold cache starts empty then emits the revalidated catalogue`() = runTest {
        val api = FakePreferencesApi(ok(wire("work", "Work", order = 0)))
        val store = InMemoryCategorySnapshotStore()

        repository(api, store).categoriesStream().test {
            assertThat(awaitItem()).isEmpty() // cold → Empty flattens to []
            assertThat(awaitItem().map { it.id }).containsExactly("work") // revalidated
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(api.calls).isEqualTo(1)
    }

    @Test
    fun `stream surfaces a background revalidation failure yet stays empty on a cold cache`() = runTest {
        val api = FakePreferencesApi(ApiResponse(success = false, error = "offline"))
        val store = InMemoryCategorySnapshotStore()
        val errors = mutableListOf<Throwable>()
        val emissions = mutableListOf<List<CategoryOption>>()

        val job = launch {
            repository(api, store).categoriesStream(onSyncError = { errors.add(it) }).collect { emissions.add(it) }
        }
        advanceUntilIdle()
        job.cancel()

        assertThat(emissions.first()).isEmpty()
        assertThat(errors.map { it.message }).containsExactly("offline")
    }

    @Test
    fun `refresh pulls the catalogue and persists it to the snapshot store`() = runTest {
        val api = FakePreferencesApi(ok(wire("a", "Alpha", order = 2)))
        val store = InMemoryCategorySnapshotStore()

        repository(api, store).refresh()

        assertThat(store.observe().first()).containsExactly(
            CategoryOption(id = "a", name = "Alpha", order = 2),
        )
        assertThat(api.calls).isEqualTo(1)
    }

    // ── CategoryRepository.create ────────────────────────────────────────────

    @Test
    fun `create posts the trimmed name and appends the new category to a warm cache`() = runTest {
        val api = FakePreferencesApi(
            response = ok(),
            createResponse = ApiResponse(success = true, data = wire("new", "Errands", order = 3)),
        )
        val store = InMemoryCategorySnapshotStore(
            initial = listOf(CategoryOption(id = "work", name = "Work", order = 0)),
            initialSyncedAt = 1L,
        )

        val result = repository(api, store, clock = FixedClock(5_000L)).create("Errands")

        assertThat(result).isEqualTo(NetworkResult.Success(CategoryOption(id = "new", name = "Errands", order = 3)))
        assertThat(api.lastCreateBody).isEqualTo(CreateCategoryBody(name = "Errands"))
        assertThat(store.observe().first()).containsExactly(
            CategoryOption(id = "work", name = "Work", order = 0),
            CategoryOption(id = "new", name = "Errands", order = 3),
        ).inOrder()
        assertThat(store.lastSyncedAt().first()).isEqualTo(5_000L)
    }

    @Test
    fun `create on a cold cache persists a catalogue of just the new category`() = runTest {
        val api = FakePreferencesApi(
            response = ok(),
            createResponse = ApiResponse(success = true, data = wire("first", "Trips")),
        )
        val store = InMemoryCategorySnapshotStore()

        val result = repository(api, store, clock = FixedClock(9L)).create("Trips")

        assertThat(result.getOrNull()).isEqualTo(CategoryOption(id = "first", name = "Trips", order = null))
        assertThat(store.observe().first()).containsExactly(CategoryOption(id = "first", name = "Trips"))
    }

    @Test
    fun `create surfaces an API failure without touching the snapshot store`() = runTest {
        val api = FakePreferencesApi(
            response = ok(),
            createResponse = ApiResponse(success = false, error = "duplicate name"),
        )
        val store = InMemoryCategorySnapshotStore(
            initial = listOf(CategoryOption(id = "work", name = "Work", order = 0)),
            initialSyncedAt = 1L,
        )

        val result = repository(api, store).create("Work")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("duplicate name")
        assertThat(store.observe().first()).containsExactly(CategoryOption(id = "work", name = "Work", order = 0))
        assertThat(store.lastSyncedAt().first()).isEqualTo(1L)
    }
}
