package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import io.mockk.mockk
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.call.CallRecordingCapturer
import me.meeshy.sdk.call.CallRecordingController
import me.meeshy.sdk.call.CallRecordingEncryptionGate
import me.meeshy.sdk.call.CallRecordingSignals
import me.meeshy.sdk.call.CallRecordingUploader
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** Le voyant d'enregistrement s'efface avec les commandes de l'appel, comme iOS `showsStatus` (#13766). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallRecordingStatusChromeTest {
    @get:Rule val rule = createComposeRule()

    private fun askingController(): CallRecordingController {
        val signals = object : CallRecordingSignals {
            override val events: Flow<CallRecordingSocketEvent> = emptyFlow()
            override suspend fun request(callId: String, kind: CallRecordingKind): Result<String> = awaitCancellation()
            override suspend fun answer(callId: String, recordingId: String, accepted: Boolean) = Result.success(Unit)
            override suspend fun stop(callId: String, recordingId: String) = Result.success(Unit)
        }
        val capturer = object : CallRecordingCapturer {
            override val isAvailable: Boolean = true
            override fun start(file: File, kind: CallRecordingKind): Boolean = true
            override fun stop(): File? = null
        }
        val uploader = object : CallRecordingUploader {
            override suspend fun upload(file: File, mimeType: String): Result<String> = Result.success("att")
        }
        val encryption = object : CallRecordingEncryptionGate {
            override suspend fun isEndToEnd(conversationId: String?): Boolean = false
        }
        val controller = CallRecordingController(signals, capturer, uploader, mockk(relaxed = true), { "me" }, encryption)
        controller.host = CallRecordingCallHost().apply { update("c1", "conv1", established = true) }
        controller.request(CallRecordingKind.AUDIO)
        return controller
    }

    private fun connected() = CallUiState(
        status = CallStatus.CONNECTED,
        peerName = "Bob",
        isVideoCall = true,
        isMuted = false,
        isCameraOn = true,
        isSpeakerOn = true,
        endReason = null,
        reconnectAttempt = 0,
        durationLabel = null,
        showsConnectedLayout = true,
    )

    @Test
    fun `the recording status goes with the chrome and comes back with it`() {
        val overlay = CallRecordingStatusOverlay(askingController())
        var chrome by mutableStateOf(CallChromeVisibility())
        rule.setContent {
            MeeshyTheme { overlay.Content(CallOverlayContext(connected(), Color.Black, chrome = chrome)) }
        }
        val waiting = "Waiting for everyone’s consent…"
        rule.onNodeWithText(waiting).assertIsDisplayed()

        rule.runOnIdle { chrome = chrome.toggled() }
        rule.mainClock.advanceTimeBy(CallChromeVisibility.FADE_DURATION_MILLIS * 2)
        rule.waitForIdle()
        rule.onNodeWithText(waiting).assertDoesNotExist()

        rule.runOnIdle { chrome = chrome.toggled() }
        rule.waitForIdle()
        rule.onNodeWithText(waiting).assertIsDisplayed()
    }
}
