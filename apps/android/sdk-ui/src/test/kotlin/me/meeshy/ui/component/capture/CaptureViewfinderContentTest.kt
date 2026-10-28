package me.meeshy.ui.component.capture

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.capture.CaptureFlashMode
import me.meeshy.sdk.model.composer.capture.CaptureFlashSliderTimer
import me.meeshy.sdk.model.composer.capture.CaptureSegment
import me.meeshy.sdk.model.composer.capture.CaptureSessionState
import me.meeshy.sdk.model.composer.capture.CaptureStage
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CaptureViewfinderContentTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun actions() = CaptureViewfinderActions(
        onClose = { calls += "close" },
        onFlash = { calls += "flash" },
        onFlip = { calls += "flip" },
        onDropSegment = { calls += "drop" },
        onValidate = { calls += "validate" },
        onDiscardAnswer = { calls += "discard:$it" },
        onMicrophoneNoticeTap = { calls += "settings" },
    )

    private fun show(state: CaptureSessionState, display: CaptureViewfinderDisplay = CaptureViewfinderDisplay()) {
        compose.setContent {
            MeeshyTheme {
                CaptureViewfinderContent(state, display, actions(), preview = { Box(it) }, modifier = Modifier)
            }
        }
        compose.waitForIdle()
    }

    private val one = listOf(CaptureSegment("a", "/a.mp4", 2.0))

    @Test
    fun `armed shows close, flash and flip, no segment controls`() {
        show(CaptureSessionState())
        compose.onNodeWithContentDescription("Back to the scene").assertIsDisplayed()
        compose.onNodeWithContentDescription("Flash off").assertIsDisplayed()
        compose.onNodeWithContentDescription("Switch camera").assertIsDisplayed()
        compose.onNodeWithContentDescription("Remove the last segment").assertDoesNotExist()
        compose.onNodeWithContentDescription("Place in the scene").assertDoesNotExist()
    }

    @Test
    fun `buttons call back to the host`() {
        show(CaptureSessionState())
        compose.onNodeWithContentDescription("Back to the scene").performClick()
        compose.onNodeWithContentDescription("Flash off").performClick()
        compose.onNodeWithContentDescription("Switch camera").performClick()
        assertThat(calls).containsExactly("close", "flash", "flip").inOrder()
    }

    @Test
    fun `pending segments swap in drop and validate and show the chrono with its badge`() {
        show(CaptureSessionState(segments = one), CaptureViewfinderDisplay(elapsedSec = { 2.0 }))
        compose.onNodeWithContentDescription("Remove the last segment").performClick()
        compose.onNodeWithContentDescription("Place in the scene").performClick()
        assertThat(calls).containsExactly("drop", "validate").inOrder()
        compose.onNodeWithText("0:02").assertIsDisplayed()
        compose.onNodeWithText("1 –").assertIsDisplayed()
    }

    @Test
    fun `recording keeps only the cross and the chrono`() {
        show(CaptureSessionState(stage = CaptureStage.RECORDING), CaptureViewfinderDisplay(elapsedSec = { 65.0 }))
        compose.onNodeWithText("1:05").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to the scene").assertIsDisplayed()
        compose.onNodeWithContentDescription("Switch camera").assertDoesNotExist()
        compose.onNodeWithContentDescription("Flash off").assertDoesNotExist()
    }

    @Test
    fun `an active flash shows its vertical intensity slider and its state in the label`() {
        show(CaptureSessionState(flash = CaptureFlashMode.ON, flashSlider = CaptureFlashSliderTimer().touch()))
        compose.onNodeWithContentDescription("Flash on").assertIsDisplayed()
        compose.onNodeWithContentDescription("Flash intensity").assertIsDisplayed()
    }

    @Test
    fun `no slider when the flash is off`() {
        show(CaptureSessionState(flashSlider = CaptureFlashSliderTimer().touch()))
        compose.onNodeWithContentDescription("Flash intensity").assertDoesNotExist()
    }

    @Test
    fun `an unanswered discard question shows both answers`() {
        show(CaptureSessionState(segments = one).let { it.copy(discard = it.discard.ask(take = true, photo = false)) })
        compose.onNodeWithText("Discard the video?").assertIsDisplayed()
        compose.onNodeWithText("Discard").performClick()
        compose.onNodeWithText("Keep going").performClick()
        assertThat(calls).containsExactly("discard:true", "discard:false").inOrder()
    }

    @Test
    fun `hint follows the gesture phase`() {
        show(CaptureSessionState())
        compose.onNodeWithText("double-tap for a photo · hold to film").assertIsDisplayed()
    }

    @Test
    fun `the camera unavailable notice replaces a silent black screen`() {
        show(CaptureSessionState(), CaptureViewfinderDisplay(unavailable = true))
        compose.onNodeWithText("The camera could not start").assertIsDisplayed()
    }

    @Test
    fun `a refused microphone says the video will be silent and opens Settings on tap`() {
        show(CaptureSessionState(), CaptureViewfinderDisplay(microphoneDenied = true))

        compose.onNodeWithText("Microphone denied — the video will be silent. Tap to open Settings").assertIsDisplayed().performClick()

        assertThat(calls).containsExactly("settings")
    }

    @Test
    fun `no notice while the microphone is not refused`() {
        show(CaptureSessionState())

        compose.onNodeWithText("Microphone denied — the video will be silent. Tap to open Settings").assertDoesNotExist()
    }
}
