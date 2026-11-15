package me.meeshy.app.stories

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.feature.stories.R
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13849 — « Composer » prépare la scène AVANT de la rendre (iOS `MediaComposerDoor.materialise`) : tant que les médias
 * reviennent, un voile « Préparation du média… » avec « Annuler » couvre le composeur — jamais une scène vide qu'on
 * modifierait pour la voir écrasée à l'arrivée de la graine.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryRecomposeGateTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer(seededByDoor = true) }
    }

    private val ready: StoryRecomposed by lazy {
        val post = ApiPost(id = "s1", type = "STORY", content = "", author = ApiAuthor(id = "a", username = "a"),
            storyEffects = StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "Salut"))))
        StoryRecomposed(StoryRecomposition.plan(post) as StoryRecomposition.Plan.Ready, emptyList())
    }

    @Test
    fun `while the media come back a veil says so, and the scene arrives seeded once it lifts`() {
        val pending = CompletableDeferred<StoryRecomposed?>()
        val vm = viewModel()
        compose.setContent { MeeshyTheme { StoryRecomposeGate("s1", vm, onClose = {}, recompose = { pending.await() }) } }

        compose.onNodeWithText(string(R.string.story_recompose_preparing)).assertIsDisplayed()

        pending.complete(ready)
        compose.waitForIdle()

        compose.onNodeWithText(string(R.string.story_recompose_preparing)).assertDoesNotExist()
        assertThat(vm.state.value.deck.selectedSlide.elements.map { it.text }).containsExactly("Salut")
    }

    @Test
    fun `cancelling the preparation closes the composer`() {
        val pending = CompletableDeferred<StoryRecomposed?>()
        var closed = 0
        val vm = viewModel()
        compose.setContent { MeeshyTheme { StoryRecomposeGate("s1", vm, onClose = { closed += 1 }, recompose = { pending.await() }) } }

        compose.onNodeWithText(string(R.string.stories_cancel)).performClick()

        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `a recomposition that cannot be prepared closes the composer`() {
        var closed = 0
        compose.setContent { MeeshyTheme { StoryRecomposeGate("s1", viewModel(), onClose = { closed += 1 }, recompose = { null }) } }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(1)
        compose.onNodeWithText(string(R.string.story_recompose_preparing)).assertDoesNotExist()
    }
}
