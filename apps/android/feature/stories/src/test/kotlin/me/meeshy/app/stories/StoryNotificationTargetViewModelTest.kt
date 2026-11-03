package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ReferenceAccess
import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.story.StoryNotificationContext
import me.meeshy.sdk.model.story.StoryNotificationTargetState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class StoryNotificationTargetViewModelTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val live = ApiPost(id = "s1", type = "STORY", expiresAt = "2999-01-01T00:00:00Z")
    private val gone = ApiPost(id = "s1", type = "STORY", expiresAt = "2020-01-01T00:00:00Z")

    private fun viewModel(
        cached: ApiPost? = null,
        fetch: suspend () -> NetworkResult<ApiPost>,
        args: Map<String, String?> = emptyMap(),
        repository: StoryRepository = mockk(),
    ): StoryNotificationTargetViewModel {
        every { repository.cachedPost("s1") } returns cached
        coEvery { repository.fetchPost("s1") } coAnswers { fetch() }
        val clock = object : CacheClock { override fun nowMillis(): Long = 1_800_000_000_000L }
        return StoryNotificationTargetViewModel(repository, clock, SavedStateHandle(args + (StoryNotificationTargetArgs.STORY_ID to "s1")))
    }

    private fun failure(status: Int?, code: String? = null) = NetworkResult.Failure(ApiError("x", code = code, httpStatus = status))

    private val StoryNotificationTargetViewModel.target get() = state.value.target

    @Test
    fun `une story vivante ouvre le lecteur avec la bonne action initiale`() = runTest {
        val vm = viewModel(
            fetch = { NetworkResult.Success(live) },
            args = mapOf(
                StoryNotificationTargetArgs.ACTION to "comments",
                StoryNotificationTargetArgs.COMMENT_ID to "c1",
                StoryNotificationTargetArgs.PARENT_COMMENT_ID to "p1",
            ),
        )
        assertThat(vm.target).isEqualTo(StoryNotificationTargetState.Active(live))
        val effect = vm.effects.first() as StoryNotificationTargetUiEffect.OpenViewer
        assertThat(effect).isEqualTo(
            StoryNotificationTargetUiEffect.OpenViewer("s1", StoryViewerInitialAction.COMMENTS, "c1", "p1"),
        )
    }

    @Test
    fun `le cache repond avant le reseau`() = runTest {
        val vm = viewModel(cached = live, fetch = { NetworkResult.Success(live) })
        assertThat(vm.target).isInstanceOf(StoryNotificationTargetState.Active::class.java)
    }

    @Test
    fun `une story expiree avec droit accorde reste lisible`() = runTest {
        val granted = gone.copy(referenceAccess = ReferenceAccess.GRANTED)
        val vm = viewModel(fetch = { NetworkResult.Success(granted) })
        assertThat(vm.target).isEqualTo(StoryNotificationTargetState.Active(granted))
    }

    @Test
    fun `expiree sans droit, et droit consomme, sont deux issues distinctes`() = runTest {
        assertThat(viewModel(fetch = { NetworkResult.Success(gone) }).target).isEqualTo(StoryNotificationTargetState.Expired)
        val consumed = gone.copy(referenceAccess = ReferenceAccess.CONSUMED)
        assertThat(viewModel(fetch = { NetworkResult.Success(consumed) }).target).isEqualTo(StoryNotificationTargetState.ExpiredConsumed)
    }

    @Test
    fun `404 et 403 sont des reponses expirees`() = runTest {
        assertThat(viewModel(fetch = { failure(404) }).target).isEqualTo(StoryNotificationTargetState.Expired)
        assertThat(viewModel(fetch = { failure(403) }).target).isEqualTo(StoryNotificationTargetState.Expired)
    }

    @Test
    fun `une requete qui n est pas partie est hors ligne et un 5xx est une panne serveur`() = runTest {
        assertThat(viewModel(fetch = { failure(null, code = "NETWORK") }).target).isEqualTo(StoryNotificationTargetState.Offline)
        assertThat(viewModel(fetch = { throw IOException("down") }).target).isEqualTo(StoryNotificationTargetState.Offline)
        assertThat(viewModel(fetch = { failure(503) }).target).isEqualTo(StoryNotificationTargetState.ServerFailed)
    }

    @Test
    fun `la reponse detenue n est pas ecrasee par un echec de revalidation`() = runTest {
        val vm = viewModel(cached = live, fetch = { failure(500) })
        assertThat(vm.target).isEqualTo(StoryNotificationTargetState.Active(live))
    }

    @Test
    fun `reessayer remplace la panne par la reponse`() = runTest {
        var online = false
        val vm = viewModel(fetch = { if (online) NetworkResult.Success(gone) else failure(null, code = "NETWORK") })
        assertThat(vm.target).isEqualTo(StoryNotificationTargetState.Offline)
        online = true
        vm.onEvent(StoryNotificationTargetUiEvent.Retry)
        assertThat(vm.target).isEqualTo(StoryNotificationTargetState.Expired)
    }

    @Test
    fun `le contexte de la route est restitue pour l ecran expire`() = runTest {
        val vm = viewModel(
            fetch = { failure(404) },
            args = mapOf(
                StoryNotificationTargetArgs.ACTOR_NAME to "Ann",
                StoryNotificationTargetArgs.TRIGGER to StoryNotificationTargetArgs.TRIGGER_REACTION,
                StoryNotificationTargetArgs.EMOJI to "🔥",
            ),
        )
        assertThat(vm.state.value.context.actorDisplayName).isEqualTo("Ann")
        assertThat(vm.state.value.context.trigger).isEqualTo(StoryNotificationContext.Trigger.Reaction("🔥"))
    }

    @Test
    fun `la lecture du depot ne se fait qu une fois par chargement`() = runTest {
        val repository = mockk<StoryRepository>()
        viewModel(fetch = { NetworkResult.Success(live) }, repository = repository)
        coVerify(exactly = 1) { repository.fetchPost("s1") }
    }
}
