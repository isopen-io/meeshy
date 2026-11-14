package me.meeshy.app.calls

import android.graphics.Bitmap
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallCaptureStatus
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.webrtc.VideoTrack

/**
 * « Chaque visage » dans la barre du mode Montage (#13691), comme `CallModeActionBar` d'iOS : l'option se
 * nomme et dit ce qu'elle fait, la toucher lance la prise des portraits, elle se refuse pendant un film, et
 * l'issue se dit avec son compte dans la langue de l'appareil.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallCaptureFacesUiTest {
    @get:Rule val rule = createComposeRule()

    private class NoImages : CallCaptureFrameSource {
        override fun attach(id: String, track: VideoTrack?) = Unit
        override fun detachAll() = Unit
        override suspend fun snapshot(subjects: List<CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap> = emptyMap()
    }

    private fun live(): CallLiveFrameController {
        val social = mockk<CallSocialSignalManager> {
            every { frameSelected } returns MutableSharedFlow()
            coEvery { selectCallLiveFrame(any(), any(), any(), any()) } returns Result.success(Unit)
        }
        val session = mockk<SessionRepository> { every { currentUser } returns MutableStateFlow<MeeshyUser?>(null) }
        return CallLiveFrameController(social, session).also {
            it.onTransition(CallState.Idle, CallState.Connected, CallSessionInfo("call-1", CallConfig.EMPTY))
        }
    }

    private fun capture() = CallCaptureController(
        frames = NoImages(),
        painter = { _, _, _, _ -> null },
        saver = mockk(relaxed = true),
        recorders = { mockk(relaxed = true) { coEvery { start(any(), any()) } returns true } },
        scope = CoroutineScope(Dispatchers.Unconfined),
        clock = { 0L },
        stamp = { "STAMP" },
    )

    private fun show(controller: CallLiveFrameController, capture: CallCaptureController) {
        val people = controller.people("Bob", null)
        val scene = CallCaptureScene(CallCaptureLook.Classic(CallMontageStyle.SCREEN), CallCaptureSceneRule.duo(people, true, true, false))
        rule.setContent {
            MeeshyTheme {
                CallMontagePicker(
                    live = controller,
                    capture = capture,
                    scene = scene,
                    people = people,
                    isLiveOffered = true,
                    reduceMotion = true,
                    onClose = {},
                )
            }
        }
    }

    /** « Chaque visage » n'a pas de place dessinée sur C1 : il se range sous « Réglages » (#17902, comme iOS). */
    private fun openSettings() {
        rule.onNodeWithContentDescription("Settings").performClick()
        rule.waitForIdle()
    }

    @Test
    fun `Reglages offre Chaque visage, qui dit ce qu'il enregistre`() {
        show(live(), capture())
        rule.onNodeWithContentDescription("Each face").assertDoesNotExist()
        openSettings()

        val node = rule.onNodeWithContentDescription("Each face").assertIsEnabled().fetchSemanticsNode()
        assertThat(node.config[SemanticsActions.OnClick].label).isEqualTo("Saves a square portrait of each participant to your gallery")
    }

    @Test
    fun `toucher Chaque visage lance la prise des portraits`() {
        val capture = capture()
        show(live(), capture)
        openSettings()

        rule.onNodeWithContentDescription("Each face").performClick()
        // La porte des permissions relit son historique hors du fil principal : l'issue arrive après l'inactivité de Compose.
        rule.waitUntil(timeoutMillis = 5_000) { capture.state.value.status != CallCaptureStatus.Working }

        assertThat(capture.state.value.status).isEqualTo(CallCaptureStatus.NoVideo)
        assertThat(capture.state.value.flashCount).isEqualTo(1)
    }

    @Test
    fun `apres Chaque visage la barre revient a son menu de base (#16979)`() {
        show(live(), capture())
        openSettings()

        rule.onNodeWithContentDescription("Each face").performClick()
        rule.waitForIdle()

        rule.onNodeWithContentDescription("Each face").assertDoesNotExist()
        rule.onNodeWithText("Classics").assertExists()
    }

    @Test
    fun `au Montage Reglages annonce Chaque visage, pas la luminosite`() {
        show(live(), capture())

        val node = rule.onNodeWithContentDescription("Settings").fetchSemanticsNode()
        assertThat(node.config[SemanticsActions.OnClick].label).isEqualTo("Shows “Each face” instead of the frames")
    }

    @Test
    fun `pendant un film, Chaque visage se refuse`() {
        val capture = capture()
        runBlocking { capture.startRecording({ CallCaptureScene(CallCaptureLook.Classic(CallMontageStyle.SCREEN), emptyList()) }) { true } }
        show(live(), capture)
        openSettings()

        rule.onNodeWithContentDescription("Each face").assertIsNotEnabled()
        runBlocking { capture.stopRecording() }
    }

    @Test
    fun `l'issue compte les visages enregistres`() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()

        assertThat(CallCaptureCopy.message(context, CallCaptureStatus.FacesSaved(3))).isEqualTo("3 faces saved")
        assertThat(CallCaptureCopy.message(context, CallCaptureStatus.Saved)).isEqualTo("Capture saved")
        assertThat(CallCaptureCopy.message(context, CallCaptureStatus.Idle)).isNull()
    }

    @Test
    @Config(qualifiers = "fr")
    fun `en francais, l'issue dit N visages enregistres`() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()

        assertThat(CallCaptureCopy.message(context, CallCaptureStatus.FacesSaved(2))).isEqualTo("2 visages enregistrés")
    }
}
