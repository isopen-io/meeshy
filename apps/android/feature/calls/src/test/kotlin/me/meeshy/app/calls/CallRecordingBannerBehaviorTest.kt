package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import io.mockk.mockk
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.call.CallRecordingCapturer
import me.meeshy.sdk.call.CallRecordingController
import me.meeshy.sdk.call.CallRecordingEncryptionGate
import me.meeshy.sdk.call.CallRecordingSignals
import me.meeshy.sdk.call.CallRecordingUploader
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingPhase
import me.meeshy.sdk.model.call.CallRecordingRequested
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * #17795 — ce que la pile d'enregistrement MONTRE, rendu à l'écran : en groupe, la carte d'accord nomme celui qui demande (R2.2),
 * et le mot du bouton passe d'« Annuler » à « Arrêter » en fondu croisé, jamais d'un coup (R3.3).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallRecordingBannerBehaviorTest {
    @get:Rule val rule = createComposeRule()

    private fun controllerAskedBy(requesterId: String): CallRecordingController {
        val wire = MutableSharedFlow<CallRecordingSocketEvent>(replay = 1)
        val signals = object : CallRecordingSignals {
            override val events: Flow<CallRecordingSocketEvent> = wire
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
        wire.tryEmit(
            CallRecordingSocketEvent.Requested(
                CallRecordingRequested(
                    callId = "c1",
                    recordingId = "r1",
                    requesterId = requesterId,
                    requiredUserIds = listOf("me", "u-awa"),
                    kind = CallRecordingKind.AUDIO,
                    expiresAtMillis = null,
                ),
            ),
        )
        return controller
    }

    private fun groupCall() = CallUiState(
        status = CallStatus.CONNECTED,
        peerName = "Awa",
        isVideoCall = false,
        isMuted = false,
        isCameraOn = false,
        isSpeakerOn = true,
        endReason = null,
        reconnectAttempt = 0,
        durationLabel = null,
        showsConnectedLayout = true,
        participantNames = mapOf("u-awa" to "Awa", "u-karim" to "Karim"),
    )

    @Test
    fun `en groupe, la carte d'accord nomme celui qui demande, jamais le pair principal (R2_2)`() {
        val controller = controllerAskedBy("u-karim")
        val overlay = CallRecordingConsentOverlay(controller)
        rule.setContent { MeeshyTheme { overlay.Content(CallOverlayContext(groupCall(), Color.Black)) } }

        rule.waitUntil(timeoutMillis = 5_000) { controller.state.value.phase is CallRecordingPhase.Pending }
        rule.onNodeWithText("Karim wants to record the call").assertIsDisplayed()
        rule.onNodeWithText("Awa wants to record the call").assertDoesNotExist()
    }

    @Test
    fun `un demandeur absent de l'annuaire est Un participant, jamais le nom de l'appel (R2_2)`() {
        val controller = controllerAskedBy("u-inconnu")
        val overlay = CallRecordingConsentOverlay(controller)
        rule.setContent { MeeshyTheme { overlay.Content(CallOverlayContext(groupCall(), Color.Black)) } }

        rule.waitUntil(timeoutMillis = 5_000) { controller.state.value.phase is CallRecordingPhase.Pending }
        rule.onNodeWithText("A participant wants to record the call").assertIsDisplayed()
        rule.onNodeWithText("Awa wants to record the call").assertDoesNotExist()
    }

    @Test
    fun `Annuler devient Arreter en fondu croise, les deux mots se croisent un instant (R3_3)`() {
        var word by mutableStateOf("Cancel")
        rule.setContent { MeeshyTheme { CallShareStopButton(onStop = {}, label = "Stop recording", word = word) } }
        rule.waitForIdle()

        rule.mainClock.autoAdvance = false
        word = "Stop"
        rule.waitForIdle()
        rule.mainClock.advanceTimeBy(100)

        rule.onAllNodesWithText("Cancel", useUnmergedTree = true).assertCountEquals(1)
        rule.onAllNodesWithText("Stop", useUnmergedTree = true).assertCountEquals(1)

        rule.mainClock.autoAdvance = true
        rule.waitForIdle()
        rule.onAllNodesWithText("Cancel", useUnmergedTree = true).assertCountEquals(0)
        rule.onAllNodesWithText("Stop", useUnmergedTree = true).assertCountEquals(1)
    }
}
