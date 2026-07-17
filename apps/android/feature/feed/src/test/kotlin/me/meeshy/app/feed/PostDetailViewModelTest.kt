package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PostDetailViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val config = MeeshyConfig()

    private fun post(
        id: String = "p1",
        content: String? = "Bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = null,
    ) = ApiPost(
        id = id,
        content = content,
        translations = translations,
        originalLanguage = "fr",
    )

    private val bilingual = post(
        translations = mapOf(
            "en" to ApiPostTranslationEntry(text = "Hello"),
            "es" to ApiPostTranslationEntry(text = "Hola"),
        ),
    )

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun user(prefs: Prefs) = MeeshyUser(
        id = "me",
        username = "me",
        systemLanguage = prefs.systemLanguage,
        regionalLanguage = prefs.regionalLanguage,
        customDestinationLanguage = prefs.customDestinationLanguage,
    )

    private fun viewModel(
        postId: String? = "p1",
        currentUser: MeeshyUser? = null,
    ): PostDetailViewModel {
        every { session.currentUser } returns MutableStateFlow(currentUser)
        val handle = SavedStateHandle(if (postId == null) emptyMap() else mapOf("postId" to postId))
        return PostDetailViewModel(repository, session, config, handle)
    }

    @Test
    fun `loadInitial populates the post`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post(content = "Hi"))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.id).isEqualTo("p1")
            assertThat(s.post?.content).isEqualTo("Hi")
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.notFound).isFalse()
            assertThat(s.errorMessage).isNull()
        }
    }

    @Test
    fun `loadInitial forwards the route postId to the repository`() = runTest {
        coEvery { repository.getPost("p42") } returns NetworkResult.Success(post(id = "p42"))

        viewModel(postId = "p42")

        coVerify(exactly = 1) { repository.getPost("p42") }
    }

    @Test
    fun `a blank postId never hits the network and marks not-found`() = runTest {
        val vm = viewModel(postId = null)

        vm.state.test {
            val s = awaitItem()
            assertThat(s.notFound).isTrue()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.post).isNull()
        }
        coVerify(exactly = 0) { repository.getPost(any()) }
    }

    @Test
    fun `cold load shows a skeleton until the post arrives`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } coAnswers { gate.await() }

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().showSkeleton).isTrue()
            gate.complete(NetworkResult.Success(post()))
            val settled = awaitItem()
            assertThat(settled.showSkeleton).isFalse()
            assertThat(settled.post?.id).isEqualTo("p1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadInitial failure surfaces the error and hides the skeleton`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Failure(ApiError("boom"))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("boom")
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.post).isNull()
            assertThat(s.notFound).isFalse()
        }
    }

    @Test
    fun `loadInitial is guarded once the post has loaded`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(post())

        val vm = viewModel()
        vm.loadInitial()

        coVerify(exactly = 1) { repository.getPost("p1") }
    }

    @Test
    fun `refresh re-fetches the post`() = runTest {
        coEvery { repository.getPost("p1") } returnsMany listOf(
            NetworkResult.Success(post(content = "old")),
            NetworkResult.Success(post(content = "new")),
        )

        val vm = viewModel()
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().post?.content).isEqualTo("new")
        }
        coVerify(exactly = 2) { repository.getPost("p1") }
    }

    @Test
    fun `refresh on a blank postId is inert`() = runTest {
        val vm = viewModel(postId = null)
        vm.refresh()

        coVerify(exactly = 0) { repository.getPost(any()) }
    }

    @Test
    fun `onFlagTap switches the displayed language to a translation`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)

        // System=en, regional=es → default resolution shows English; both are strip chips.
        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en", regionalLanguage = "es")))
        vm.onFlagTap("es")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.content).isEqualTo("Hola")
            assertThat(s.post?.languageStrip?.first { it.code == "es" }?.isActive).isTrue()
        }
    }

    @Test
    fun `onFlagTap on the already-active language reverts to the default resolution`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en", regionalLanguage = "es")))
        vm.onFlagTap("es")
        vm.onFlagTap("es")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.post?.content).isEqualTo("Hello")
            assertThat(s.post?.languageStrip?.first { it.code == "en" }?.isActive).isTrue()
        }
    }

    @Test
    fun `onFlagTap before the post has loaded is inert`() = runTest {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        coEvery { repository.getPost("p1") } coAnswers { gate.await() }

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en")))
        vm.onFlagTap("es")

        vm.state.test {
            assertThat(awaitItem().post).isNull()
            gate.complete(NetworkResult.Success(bilingual))
            // The tap on the not-yet-loaded post left no override, so the default stands.
            assertThat(awaitItem().post?.content).isEqualTo("Hello")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `onFlagTap with a content-less language keeps the default resolution`() = runTest {
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(bilingual)

        val vm = viewModel(currentUser = user(Prefs(systemLanguage = "en")))
        vm.onFlagTap("de")

        vm.state.test {
            assertThat(awaitItem().post?.content).isEqualTo("Hello")
        }
    }
}
