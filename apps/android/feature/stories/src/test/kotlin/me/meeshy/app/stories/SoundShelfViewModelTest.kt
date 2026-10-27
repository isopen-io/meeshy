package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.audio.SoundLibrary
import me.meeshy.sdk.audio.SoundPage
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.SoundRemoval
import me.meeshy.sdk.model.composer.sound.SoundShelfTab
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SoundShelfViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private fun sound(id: String, title: String = "T$id", posts: Int = 0) =
        ApiSound(id = id, title = title, fileUrl = "u$id", postCount = posts)

    private class FakeLibrary : SoundLibrary {
        var minePages: Map<String?, SoundPage> = emptyMap()
        var trendingList: List<ApiSound> = emptyList()
        var failRemove = false
        var failMine = false
        val trendingQueries = mutableListOf<String?>()
        val removed = mutableListOf<String>()

        override suspend fun mine(query: String?, cursor: String?): NetworkResult<SoundPage> =
            if (failMine) NetworkResult.Failure(ApiError("x")) else NetworkResult.Success(minePages[cursor] ?: SoundPage(emptyList(), null))

        override suspend fun trending(query: String?): NetworkResult<List<ApiSound>> {
            trendingQueries += query
            return NetworkResult.Success(trendingList)
        }

        override suspend fun rename(id: String, title: String): NetworkResult<ApiSound> =
            NetworkResult.Success(ApiSound(id = id, title = title, fileUrl = "u$id"))

        override suspend fun remove(id: String): NetworkResult<SoundRemoval> {
            removed += id
            return if (failRemove) NetworkResult.Failure(ApiError("no")) else NetworkResult.Success(SoundRemoval(id, "d", 0))
        }
    }

    private fun vm(lib: FakeLibrary) = SoundShelfViewModel(lib).also { it.queryDebounceMs = 0L }

    @Test
    fun `a library sound previews from the gateway origin, never from its bare relative path`() {
        val vm = SoundShelfViewModel(FakeLibrary(), MeeshyConfig(apiBaseUrl = "https://gate.staging.meeshy.me/api/v1/"))

        assertThat(vm.playableUrl(ApiSound(id = "s", fileUrl = "/api/v1/static/s.m4a")))
            .isEqualTo("https://gate.staging.meeshy.me/api/v1/static/s.m4a")
    }

    @Test
    fun `opening loads my sounds first and only once`() = runTest {
        val lib = FakeLibrary().apply { minePages = mapOf(null to SoundPage(listOf(sound("a")), "c1")) }
        val vm = vm(lib)
        vm.loadIfNeeded()
        assertThat(vm.state.value.sounds.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.tab).isEqualTo(SoundShelfTab.MINE)
        lib.minePages = emptyMap()
        vm.loadIfNeeded()
        assertThat(vm.state.value.sounds).hasSize(1)
    }

    @Test
    fun `load more appends the next page and trending never pages`() = runTest {
        val lib = FakeLibrary().apply {
            minePages = mapOf(null to SoundPage(listOf(sound("a")), "c1"), "c1" to SoundPage(listOf(sound("b")), null))
            trendingList = listOf(sound("t"))
        }
        val vm = vm(lib)
        vm.loadIfNeeded()
        assertThat(vm.state.value.canLoadMore).isTrue()
        vm.loadMore()
        assertThat(vm.state.value.sounds.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(vm.state.value.canLoadMore).isFalse()
        vm.onTabChange(SoundShelfTab.TRENDING)
        assertThat(vm.state.value.sounds.map { it.id }).containsExactly("t")
        assertThat(vm.state.value.canLoadMore).isFalse()
        assertThat(vm.state.value.canRemove).isFalse()
    }

    @Test
    fun `searching trending goes to the server with the query`() = runTest {
        val lib = FakeLibrary()
        val vm = vm(lib)
        vm.onTabChange(SoundShelfTab.TRENDING)
        vm.onQueryChange("ana")
        assertThat(lib.trendingQueries.last()).isEqualTo("ana")
    }

    @Test
    fun `a failed load shows the empty shelf, not a crash`() = runTest {
        val lib = FakeLibrary().apply { failMine = true }
        val vm = vm(lib)
        vm.loadIfNeeded()
        assertThat(vm.state.value.sounds).isEmpty()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `removal is optimistic and a refusal puts the row back at its own place`() = runTest {
        val lib = FakeLibrary().apply {
            minePages = mapOf(null to SoundPage(listOf(sound("a"), sound("b"), sound("c")), null)); failRemove = true
        }
        val vm = vm(lib)
        vm.loadIfNeeded()
        vm.beginRemove(vm.state.value.sounds[1])
        assertThat(vm.state.value.removing!!.id).isEqualTo("b")
        vm.confirmRemove()
        assertThat(vm.state.value.sounds.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(vm.state.value.removalFailed).isTrue()
        assertThat(vm.state.value.removing).isNull()
    }

    @Test
    fun `a confirmed removal drops the row and clears the failure flag`() = runTest {
        val lib = FakeLibrary().apply { minePages = mapOf(null to SoundPage(listOf(sound("a"), sound("b")), null)) }
        val vm = vm(lib)
        vm.loadIfNeeded()
        vm.beginRemove(vm.state.value.sounds[0])
        vm.confirmRemove()
        assertThat(vm.state.value.sounds.map { it.id }).containsExactly("b")
        assertThat(lib.removed).containsExactly("a")
        assertThat(vm.state.value.removalFailed).isFalse()
    }

    @Test
    fun `cancelling a removal removes nothing`() = runTest {
        val lib = FakeLibrary().apply { minePages = mapOf(null to SoundPage(listOf(sound("a")), null)) }
        val vm = vm(lib)
        vm.loadIfNeeded()
        vm.beginRemove(vm.state.value.sounds[0])
        vm.cancelRemove()
        assertThat(vm.state.value.removing).isNull()
        assertThat(lib.removed).isEmpty()
    }

    @Test
    fun `renaming replaces the row in place and trending cannot rename`() = runTest {
        val lib = FakeLibrary().apply { minePages = mapOf(null to SoundPage(listOf(sound("a"), sound("b")), null)) }
        val vm = vm(lib)
        vm.loadIfNeeded()
        vm.beginRename(vm.state.value.sounds[1])
        assertThat(vm.state.value.renaming!!.id).isEqualTo("b")
        vm.commitRename("Nouveau")
        assertThat(vm.state.value.sounds.map { it.title }).containsExactly("Ta", "Nouveau").inOrder()
        assertThat(vm.state.value.renaming).isNull()
    }
}
