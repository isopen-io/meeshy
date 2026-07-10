package me.meeshy.app.stories

import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)

    private fun viewModel(
        user: MeeshyUser? = MeeshyUser(id = "me", username = "me", systemLanguage = "en"),
    ): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(user)
        return StoryComposerViewModel(repo, session, workManager)
    }

    @Test
    fun `onTextChange updates the draft text and can publish`() = runTest {
        val vm = viewModel()

        vm.onTextChange("hello world")

        assertThat(vm.state.value.draft.text).isEqualTo("hello world")
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `onVisibilityChange updates the draft visibility`() = runTest {
        val vm = viewModel()

        vm.onVisibilityChange(StoryVisibility.FRIENDS)

        assertThat(vm.state.value.draft.visibility).isEqualTo(StoryVisibility.FRIENDS)
    }

    @Test
    fun `blank draft cannot publish`() = runTest {
        val vm = viewModel()
        vm.onTextChange("   ")
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `publish enqueues one story, kicks the drain worker and emits published`() = runTest {
        val vm = viewModel()
        vm.onTextChange("  bonjour  ")
        vm.onVisibilityChange(StoryVisibility.FRIENDS)
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request)) } returns "cmid-1"

        vm.published.test {
            vm.publish()
            awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        coVerify(exactly = 1) { repo.enqueuePublish(any()) }
        coVerify(exactly = 1) { workManager.enqueue(any<OneTimeWorkRequest>()) }
        assertThat(request.captured.type).isEqualTo("STORY")
        assertThat(request.captured.content).isEqualTo("bonjour")
        assertThat(request.captured.visibility).isEqualTo("FRIENDS")
    }

    @Test
    fun `publish resolves the original language from the session user`() = runTest {
        val vm = viewModel(MeeshyUser(id = "me", username = "me", systemLanguage = "es"))
        vm.onTextChange("hola")
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request)) } returns "cmid"

        vm.publish()

        assertThat(request.captured.originalLanguage).isEqualTo("es")
    }

    @Test
    fun `publish falls back to fr when there is no signed-in user`() = runTest {
        val vm = viewModel(user = null)
        vm.onTextChange("hi")
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request)) } returns "cmid"

        vm.publish()

        assertThat(request.captured.originalLanguage).isEqualTo("fr")
    }

    @Test
    fun `publish clears the draft and the publishing flag on success`() = runTest {
        val vm = viewModel()
        vm.onTextChange("hi")
        coEvery { repo.enqueuePublish(any()) } returns "cmid"

        vm.publish()

        assertThat(vm.state.value.draft.text).isEmpty()
        assertThat(vm.state.value.isPublishing).isFalse()
    }

    @Test
    fun `publish on a blank draft does nothing`() = runTest {
        val vm = viewModel()
        vm.onTextChange("   ")

        vm.publish()

        coVerify(exactly = 0) { repo.enqueuePublish(any()) }
        coVerify(exactly = 0) { workManager.enqueue(any<OneTimeWorkRequest>()) }
    }

    @Test
    fun `publish is re-entrancy guarded while a publish is in flight`() = runTest {
        val vm = viewModel()
        vm.onTextChange("hi")
        val gate = CompletableDeferred<String?>()
        coEvery { repo.enqueuePublish(any()) } coAnswers { gate.await() }

        vm.publish()
        vm.publish()
        gate.complete("cmid")

        coVerify(exactly = 1) { repo.enqueuePublish(any()) }
    }

    @Test
    fun `publish surfaces an error and preserves the draft when the queue throws`() = runTest {
        val vm = viewModel()
        vm.onTextChange("hi")
        coEvery { repo.enqueuePublish(any()) } throws IllegalStateException("disk full")

        vm.publish()

        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.isPublishing).isFalse()
        assertThat(vm.state.value.draft.text).isEqualTo("hi")
    }
}
