package me.meeshy.sdk.category

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiCategory
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.preferences.InMemoryPreferenceSnapshotStore
import me.meeshy.sdk.preferences.ScriptedPreferencesApi
import me.meeshy.sdk.preferences.okResponse
import me.meeshy.sdk.preferences.refused
import org.junit.Test

class CategoryExpansionTest {

    private class FixedClock(private val now: Long) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private val json = Json { ignoreUnknownKeys = true }

    private fun repository(api: ScriptedPreferencesApi, expansion: CategoryExpansionStore) =
        CategoryRepository(api, InMemoryCategorySnapshotStore(), FixedClock(1_000L), expansion)

    private fun expansionStore() = CategoryExpansionStore(InMemoryPreferenceSnapshotStore(), json)

    @Test
    fun `folding a section persists it and patches the gateway`() = runTest {
        val api = ScriptedPreferencesApi()
        val expansion = expansionStore()

        val result = repository(api, expansion).setExpanded("work", false)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(api.patchedCategories.single().first).isEqualTo("work")
        assertThat(api.patchedCategories.single().second.isExpanded).isFalse()
        assertThat(expansion.observe().first()).containsExactly("work", false)
    }

    @Test
    fun `a refused fold restores the previous state`() = runTest {
        val api = ScriptedPreferencesApi().apply { patchCategoryResponse = refused() }
        val expansion = expansionStore().apply { set("work", true) }

        repository(api, expansion).setExpanded("work", false)

        assertThat(expansion.observe().first()).containsExactly("work", true)
    }

    @Test
    fun `a refused fold of a never-stated section forgets it`() = runTest {
        val api = ScriptedPreferencesApi().apply { patchCategoryResponse = refused() }
        val expansion = expansionStore()

        repository(api, expansion).setExpanded("work", false)

        assertThat(expansion.observe().first()).isEmpty()
    }

    @Test
    fun `an offline fold keeps what the user chose`() = runTest {
        val api = ScriptedPreferencesApi().apply { throwNetwork = true }
        val expansion = expansionStore()

        val result = repository(api, expansion).setExpanded("work", false)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(expansion.observe().first()).containsExactly("work", false)
    }

    @Test
    fun `revalidating the catalogue adopts the fold state the gateway holds`() = runTest {
        val api = ScriptedPreferencesApi().apply {
            categories = okResponse(
                listOf(
                    ApiCategory(id = "a", name = "A", isExpanded = false),
                    ApiCategory(id = "b", name = "B", isExpanded = null),
                ),
            )
        }
        val expansion = expansionStore().apply { set("stale", true) }

        repository(api, expansion).refresh()

        assertThat(expansion.observe().first()).containsExactly("a", false)
    }

    @Test
    fun `the fold state is read back from the persisted snapshot`() = runTest {
        val shared = InMemoryPreferenceSnapshotStore()
        CategoryExpansionStore(shared, json).set("work", false)

        assertThat(CategoryExpansionStore(shared, json).observe().first()).containsExactly("work", false)
    }
}
