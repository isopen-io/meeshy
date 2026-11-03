package me.meeshy.ui.component.voiceprofile

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.sdk.model.VoiceProfileStatus
import me.meeshy.sdk.model.voice.VoiceWizardError
import me.meeshy.sdk.model.voice.VoiceWizardState
import me.meeshy.sdk.model.voice.VoiceWizardStep
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VoiceProfileWizardViewTest {

    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int, vararg args: Any): String =
        ApplicationProvider.getApplicationContext<android.app.Application>().getString(id, *args)

    private class Calls {
        var closed = 0
        var consent: Boolean? = null
        var continued = 0
        var verified = 0
        var dismissed = 0
    }

    private fun show(state: VoiceWizardState, calls: Calls = Calls()): Calls {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                VoiceProfileWizardView(
                    state = state,
                    onClose = { calls.closed += 1 },
                    onConsentChange = { calls.consent = it },
                    onContinueFromConsent = { calls.continued += 1 },
                    onBirthDateChange = {},
                    onVerifyAge = { calls.verified += 1 },
                    onSamplesReady = {},
                    onErrorDismiss = { calls.dismissed += 1 },
                    recordingContent = { androidx.compose.material3.Text("recording-slot") },
                )
            }
        }
        return calls
    }

    @Test
    fun `the progress bar announces the title of each step to TalkBack`() {
        val shown = mutableStateOf(VoiceWizardState())
        compose.setContent { MeeshyTheme(darkTheme = false) { VoiceProfileWizardViewHost(shown.value) } }
        VoiceWizardStep.entries.forEach { step ->
            shown.value = VoiceWizardState(step = step)
            compose.waitForIdle()
            val description = compose.onNodeWithTag(VOICE_WIZARD_PROGRESS_TAG).fetchSemanticsNode().config[SemanticsProperties.ContentDescription]
            assertThat(description).containsExactly(string(voiceWizardStepTitle(step)))
        }
    }

    @Test
    fun `the progress bar draws one segment per step and exposes the position`() {
        show(VoiceWizardState(step = VoiceWizardStep.RECORDING))
        val range = compose.onNodeWithTag(VOICE_WIZARD_PROGRESS_TAG).fetchSemanticsNode().config[SemanticsProperties.ProgressBarRangeInfo]
        assertThat(range.current).isEqualTo(3f)
        assertThat(range.range.endInclusive).isEqualTo(5f)
    }

    @Test
    fun `continue is disabled until the consent is given and the close button closes`() {
        val calls = show(VoiceWizardState())
        compose.onNodeWithTag(VOICE_WIZARD_CONSENT_CONTINUE_TAG).assertIsNotEnabled()
        compose.onNodeWithTag(VOICE_WIZARD_CLOSE_TAG).assertTextContains(string(R.string.voiceProfile_wizard_close))
        compose.onNodeWithTag(VOICE_WIZARD_CLOSE_TAG).performClick()
        assertThat(calls.closed).isEqualTo(1)
    }

    @Test
    fun `toggling the acceptance reports the new value and an accepted consent enables continue`() {
        val calls = show(VoiceWizardState(consentGiven = true))
        compose.onNodeWithTag(VOICE_WIZARD_CONSENT_CONTINUE_TAG).assertIsEnabled()
        compose.onNodeWithTag(VOICE_WIZARD_CONSENT_TOGGLE_TAG).performScrollTo().performClick()
        assertThat(calls.consent).isFalse()
        compose.onNodeWithTag(VOICE_WIZARD_CONSENT_CONTINUE_TAG).performScrollTo().performClick()
        assertThat(calls.continued).isEqualTo(1)
    }

    @Test
    fun `the consent step lists the five points`() {
        show(VoiceWizardState())
        listOf(
            R.string.voiceProfile_consent_point1,
            R.string.voiceProfile_consent_point2,
            R.string.voiceProfile_consent_point3,
            R.string.voiceProfile_consent_point4,
            R.string.voiceProfile_consent_point5,
        ).forEach { compose.onNodeWithText(string(it)).assertExists() }
    }

    @Test
    fun `the recording step hosts the sample screen`() {
        show(VoiceWizardState(step = VoiceWizardStep.RECORDING))
        compose.onNodeWithText("recording-slot").assertExists()
    }

    @Test
    fun `the processing step shows n over N`() {
        show(VoiceWizardState(step = VoiceWizardStep.PROCESSING, uploadedCount = 1, totalToUpload = 3))
        compose.onNodeWithText(string(R.string.voiceProfile_wizard_upload_progress, 1, 3)).assertExists()
        compose.onNodeWithText(string(R.string.voiceProfile_processing_title)).assertExists()
    }

    @Test
    fun `the complete step shows the recap and finishing closes`() {
        val profile = VoiceProfile(id = "p", sampleCount = 3, totalDurationMs = 31_000, quality = 0.87, status = VoiceProfileStatus.READY)
        val calls = show(VoiceWizardState(step = VoiceWizardStep.COMPLETE, profile = profile))
        compose.onNodeWithText("31s").assertExists()
        compose.onNodeWithText("87%").assertExists()
        compose.onNodeWithText(string(R.string.voiceProfile_wizard_status_ready)).assertExists()
        compose.onNodeWithTag(VOICE_WIZARD_FINISH_TAG).performScrollTo().performClick()
        assertThat(calls.closed).isEqualTo(1)
    }

    @Test
    fun `each error raises its alert and OK dismisses it`() {
        val calls = show(VoiceWizardState(error = VoiceWizardError.CONSENT))
        compose.onNodeWithText(string(R.string.voiceProfile_wizard_error_consent)).assertExists()
        compose.onNodeWithText(string(R.string.voiceProfile_wizard_ok)).performClick()
        assertThat(calls.dismissed).isEqualTo(1)
    }

    @Test
    fun `no alert is shown without an error`() {
        show(VoiceWizardState())
        assertThat(compose.onAllNodesWithTag(VOICE_WIZARD_ERROR_TAG).fetchSemanticsNodes()).isEmpty()
    }
}

@androidx.compose.runtime.Composable
private fun VoiceProfileWizardViewHost(state: VoiceWizardState) {
    VoiceProfileWizardView(
        state = state,
        onClose = {},
        onConsentChange = {},
        onContinueFromConsent = {},
        onBirthDateChange = {},
        onVerifyAge = {},
        onSamplesReady = {},
        onErrorDismiss = {},
        recordingContent = {},
    )
}
