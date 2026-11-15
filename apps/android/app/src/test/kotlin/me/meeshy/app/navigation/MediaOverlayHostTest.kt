package me.meeshy.app.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.remember
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.app.audio.MiniPlayerDisplay
import me.meeshy.app.audio.MiniPlayerViewModel
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.playback.AudioEngineEvent
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.ui.R
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le mini-lecteur dans la colonne de la racine : il se monte quand un vocal joue hors de sa conversation et le toucher y ramène. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en")
class MediaOverlayHostTest {

    @get:Rule val compose = createComposeRule()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class FakeEngine : AudioPlaybackEngine {
        val mutable = MutableStateFlow(AudioPlaybackState())
        override val state: StateFlow<AudioPlaybackState> = mutable
        override val events: SharedFlow<AudioEngineEvent> = MutableSharedFlow()
        override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean {
            mutable.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true, durationMs = 20_000)
            return true
        }
        override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin) = play(attachmentId, fileUri, origin, false)
        override fun togglePlayPause(origin: PlaybackCommandOrigin) = Unit
        override fun pause() = Unit
        override fun resumeFromInterruption() = Unit
        override fun stop() {
            mutable.value = AudioPlaybackState()
        }
        override fun seek(fraction: Double) = Unit
        override fun seekToMs(positionMs: Long) = Unit
        override fun skip(seconds: Double) = Unit
        override fun setSpeed(speed: PlaybackSpeed) = Unit
        override fun cycleSpeed() = Unit
        override fun setLoop(loop: Boolean) = Unit
        override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
        override fun setConsumedLanguageProvider(provider: (() -> String?)?) = Unit
    }

    // Construits au premier usage, APRES le setMain du @Before : le viewModelScope se lie au dispatcher principal courant.
    private val coordinator by lazy { ConversationAudioCoordinator(FakeEngine(), UnconfinedTestDispatcher()) }
    private val viewModel by lazy { MiniPlayerViewModel(coordinator, MiniPlayerDisplay()) }
    private lateinit var controller: NavHostController

    private fun str(id: Int, vararg args: Any) =
        ApplicationProvider.getApplicationContext<android.content.Context>().getString(id, *args)

    private fun show(callPillShown: Boolean = false, screenCoversChrome: Boolean = false) {
        compose.setContent {
            controller = rememberNavController()
            val navigator = remember(controller) { AppNavigator(controller, RouteTracker(), PresentedSurfaceRegistry(), NavigationRequests()) }
            Column {
                MediaTopBarSlot(controller, navigator, callPillShown, screenCoversChrome, viewModel)
                NavHost(controller, startDestination = "home") {
                    composable("home") {}
                    composable(
                        Routes.CHAT,
                        arguments = listOf(
                            navArgument(ChatRouteArgs.HIGHLIGHT_MESSAGE_ID) { type = NavType.StringType; nullable = true; defaultValue = null },
                        ),
                    ) {}
                }
            }
        }
        compose.waitForIdle()
    }

    private fun play() {
        coordinator.play(
            QueuedAudio(
                attachmentId = "a", messageId = "m-a", conversationId = "c1", fileUrl = "https://cdn.meeshy.me/a.m4a",
                durationMs = 20_000, senderName = "Nour", senderAvatarUrl = null, receivedAtEpochMs = 1L, isProtected = false,
            ),
            emptyList(), "Famille", null,
        )
        compose.waitForIdle()
    }

    private fun barLabel() = str(R.string.mini_player_a11y_now_playing, "Nour", "Famille")

    @Test
    fun `la barre se monte quand un vocal joue hors de sa conversation et se retire sans vocal`() {
        show()
        compose.onAllNodesWithContentDescription(barLabel()).assertCountEquals(0)

        play()
        compose.onNodeWithContentDescription(barLabel()).assertExists()

        compose.runOnUiThread { coordinator.stop() }
        compose.waitForIdle()
        compose.onAllNodesWithContentDescription(barLabel()).assertCountEquals(0)
    }

    @Test
    fun `un toucher sur la barre ouvre la conversation du vocal sur son message`() {
        show()
        play()

        compose.onNodeWithContentDescription(barLabel()).performClick()
        compose.waitForIdle()

        val entry = controller.currentBackStackEntry
        assertThat(entry?.destination?.route).isEqualTo(Routes.CHAT)
        assertThat(entry?.arguments?.getString(ChatViewModel.CONVERSATION_ID_ARG)).isEqualTo("c1")
        assertThat(entry?.arguments?.getString(ChatRouteArgs.HIGHLIGHT_MESSAGE_ID)).isEqualTo("m-a")
    }

    @Test
    fun `la barre disparait dans la conversation qui joue`() {
        show()
        play()
        compose.onNodeWithContentDescription(barLabel()).assertExists()

        compose.runOnUiThread { controller.navigate(Routes.chat("c1")) }
        compose.waitForIdle()

        compose.onAllNodesWithContentDescription(barLabel()).assertCountEquals(0)
    }

    @Test
    fun `sur l'ecran d'appel la barre ne se monte pas`() {
        show(screenCoversChrome = true)
        play()

        compose.onAllNodesWithContentDescription(barLabel()).assertCountEquals(0)
    }

    @Test
    fun `sous une pastille d'appel la barre reste montee`() {
        show(callPillShown = true)
        play()

        compose.onNodeWithContentDescription(barLabel()).assertExists()
    }
}
