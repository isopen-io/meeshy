package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La première story de l'onboarding part avec l'audience servie (#13634) ; un brouillon restauré garde la sienne, comme iOS. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerOnboardingAudienceTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun viewModel(draftStore: InMemoryStoryComposerDraftStore = InMemoryStoryComposerDraftStore()): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true), mockk<WorkManager>(relaxed = true),
            draftStore, mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        )
    }

    private fun StoryComposerViewModel.published(): CreateStoryRequest {
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"
        onTextChange("ma première story")
        publish()
        return request.captured
    }

    private fun stored(visibility: String) = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut")),
        selectedId = "s1",
        visibility = visibility,
    )

    @Test
    fun `un mineur ouvre le composeur sur ses amis et la story part en FRIENDS`() = runTest {
        val vm = viewModel()

        vm.onEnterComposer(initialVisibility = StoryVisibility.FRIENDS)

        assertThat(vm.published().visibility).isEqualTo("FRIENDS")
    }

    @Test
    fun `un adulte ou toute autre ouverture garde le defaut PUBLIC`() = runTest {
        val vm = viewModel()

        vm.onEnterComposer()

        assertThat(vm.published().visibility).isEqualTo("PUBLIC")
    }

    @Test
    fun `un brouillon restaure garde sa propre audience, comme iOS`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore(stored("PRIVATE")))

        vm.onEnterComposer(initialVisibility = StoryVisibility.FRIENDS)

        assertThat(vm.state.value.draft.visibility).isEqualTo(StoryVisibility.PRIVATE)
    }

    @Test
    fun `un brouillon restaure en PUBLIC l'emporte aussi sur l'audience servie`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore(stored("PUBLIC")))

        vm.onEnterComposer(initialVisibility = StoryVisibility.FRIENDS)

        assertThat(vm.state.value.draft.visibility).isEqualTo(StoryVisibility.PUBLIC)
    }

    @Test
    fun `l'argument de route ne porte que FRIENDS, tout le reste est ignore`() {
        assertThat(StoryComposerSeedAudience.fromRouteArg("FRIENDS")).isEqualTo(StoryVisibility.FRIENDS)
        assertThat(StoryComposerSeedAudience.fromRouteArg(null)).isNull()
        assertThat(StoryComposerSeedAudience.fromRouteArg("PUBLIC")).isNull()
        assertThat(StoryComposerSeedAudience.fromRouteArg("ONLY")).isNull()
        assertThat(StoryComposerSeedAudience.fromRouteArg("n'importe quoi")).isNull()
    }
}
