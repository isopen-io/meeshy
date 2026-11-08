package me.meeshy.app.stories

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.geometry.Offset
import androidx.test.core.app.ApplicationProvider
import coil.Coil
import coil.ImageLoader
import coil.intercept.Interceptor
import coil.request.ErrorResult
import coil.request.ImageResult
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.story.StoryGroupIntro
import me.meeshy.sdk.model.story.StoryGroupIntroDismissal
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StoryGroupIntroOverlayComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        Coil.setImageLoader(ImageLoader.Builder(ApplicationProvider.getApplicationContext()).components { add(NoImages) }.build())
    }

    @After
    fun tearDown() {
        Coil.reset()
        Dispatchers.resetMain()
    }

    private object NoImages : Interceptor {
        override suspend fun intercept(chain: Interceptor.Chain): ImageResult =
            ErrorResult(null, chain.request, IllegalStateException("not loaded in a test"))
    }

    private val intro = StoryGroupIntro("u1", "ada", displayName = "Ada Lovelace", moodEmoji = "😀", moodMessage = "Au calme")

    private class Taps { var skips = 0; var backs = 0 }

    private fun show(taps: Taps, presence: PresenceState? = null) = compose.setContent {
        StoryGroupIntroOverlay(intro = intro, avatarUrl = null, presence = presence, onSkip = { taps.skips++ }, onBack = { taps.backs++ })
    }

    @Test
    fun `l identite complete est annoncee nom pseudo et humeur`() {
        show(Taps())
        compose.onNodeWithText("Ada Lovelace").assertExists()
        compose.onNodeWithText("@ada").assertExists()
        compose.onNodeWithText("Au calme").assertExists()
    }

    @Test
    fun `sans detail de presence autorise aucun libelle de presence n apparait`() {
        show(Taps(), presence = null)
        compose.onAllNodesWithText("Online").assertCountEquals(0)
        compose.onAllNodesWithText("Offline").assertCountEquals(0)
    }

    @Test
    fun `un ami en ligne voit son badge de presence`() {
        show(Taps(), presence = PresenceState.ONLINE)
        compose.onAllNodesWithText("Online").assertCountEquals(1)
    }

    @Test
    fun `le double toucher saute a la premiere slide`() {
        val taps = Taps()
        show(taps)
        compose.onRoot().performTouchInput { doubleClick(Offset(width * 0.2f, height / 2f)) }
        assertThat(taps.skips).isEqualTo(1)
        assertThat(taps.backs).isEqualTo(0)
    }

    @Test
    fun `le toucher a gauche revient au groupe precedent et a droite saute`() {
        val taps = Taps()
        show(taps)
        compose.onRoot().performTouchInput { click(Offset(width * 0.1f, height / 2f)) }
        compose.mainClock.advanceTimeBy(1_000)
        compose.onRoot().performTouchInput { click(Offset(width * 0.9f, height / 2f)) }
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(taps.backs).isEqualTo(1)
        assertThat(taps.skips).isEqualTo(1)
    }

    @Test
    fun `un glisse n est pas requalifie en toucher`() {
        val taps = Taps()
        show(taps)
        compose.onRoot().performTouchInput { swipeRight() }
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(taps.skips + taps.backs).isEqualTo(0)
    }

    @Test
    fun `la couche disparait une fois l interlude leve et reste absente avant`() {
        val ui = StoryGroupIntroUi()
        compose.setContent { StoryGroupIntroLayer(ui) }
        compose.onAllNodesWithText("Ada Lovelace").assertCountEquals(0)
        compose.runOnIdle { ui.begin(intro, null, null, StoryGroupIntroDismissal.Tween(300)) }
        compose.onNodeWithText("Ada Lovelace").assertExists()
        compose.runOnIdle { ui.shown = false }
        compose.mainClock.advanceTimeBy(1_000)
        compose.onAllNodesWithText("Ada Lovelace").assertCountEquals(0)
    }
}
