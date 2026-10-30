package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiHashtag
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostHashtagRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Les tendances de la feuille « Hashtags » (#13846) : servies si le serveur répond, une liste vide sinon — jamais une erreur. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryHashtagSheetViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `trending tags are served without their sign`() = runTest(dispatcher) {
        val repo: PostHashtagRepository = mockk { coEvery { trending(any()) } returns NetworkResult.Success(listOf(ApiHashtag("#voyage", 3), ApiHashtag("mer"))) }
        val vm = StoryHashtagSheetViewModel(repo)
        vm.load()
        advanceUntilIdle()
        assertThat(vm.trending.value).containsExactly("voyage", "mer").inOrder()
    }

    @Test
    fun `a failing server leaves the trending row empty`() = runTest(dispatcher) {
        val repo: PostHashtagRepository = mockk { coEvery { trending(any()) } returns NetworkResult.Failure(ApiError("offline")) }
        val vm = StoryHashtagSheetViewModel(repo)
        vm.load()
        advanceUntilIdle()
        assertThat(vm.trending.value).isEmpty()
    }
}
