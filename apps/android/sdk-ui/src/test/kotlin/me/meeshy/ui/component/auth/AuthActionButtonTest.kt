package me.meeshy.ui.component.auth

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le bouton d'action des écrans d'accès : bloqué, il ignore le toucher ; en envoi, il montre
 * son indicateur, garde son libellé pour le lecteur d'écran et ignore aussi le toucher ; actif,
 * il agit ET donne un tic léger.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AuthActionButtonTest {

    @get:Rule
    val compose = createComposeRule()

    private class RecordingHaptics : HapticFeedback {
        val performed = mutableListOf<HapticFeedbackType>()
        override fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType) {
            performed += hapticFeedbackType
        }
    }

    private fun show(
        haptics: RecordingHaptics = RecordingHaptics(),
        enabled: Boolean = true,
        isLoading: Boolean = false,
        onClick: () -> Unit,
    ) {
        compose.setContent {
            CompositionLocalProvider(LocalHapticFeedback provides haptics) {
                MeeshyTheme {
                    AuthActionButton(title = "Log in", onClick = onClick, enabled = enabled, isLoading = isLoading)
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `an enabled button runs its action and gives one light tap`() {
        var clicks = 0
        val haptics = RecordingHaptics()
        show(haptics = haptics) { clicks++ }

        compose.onNodeWithText("Log in").assertIsEnabled().performClick()

        assertThat(clicks).isEqualTo(1)
        assertThat(haptics.performed).hasSize(1)
    }

    @Test
    fun `a disabled button ignores clicks and stays silent`() {
        var clicks = 0
        val haptics = RecordingHaptics()
        show(haptics = haptics, enabled = false) { clicks++ }

        compose.onNodeWithText("Log in").assertIsNotEnabled().performClick()

        assertThat(clicks).isEqualTo(0)
        assertThat(haptics.performed).isEmpty()
    }

    @Test
    fun `a loading button shows the spinner in place of the label, ignores clicks and keeps its spoken label`() {
        var clicks = 0
        show(isLoading = true) { clicks++ }

        compose.onNodeWithTag(AUTH_ACTION_SPINNER_TAG, useUnmergedTree = true).assertExists()
        compose.onNodeWithText("Log in").assertDoesNotExist()
        compose.onNodeWithContentDescription("Log in").assertIsNotEnabled().performClick()

        assertThat(clicks).isEqualTo(0)
    }

    @Test
    fun `an idle button shows its label and no spinner`() {
        show { }

        compose.onNodeWithText("Log in").assertExists()
        compose.onNodeWithTag(AUTH_ACTION_SPINNER_TAG, useUnmergedTree = true).assertDoesNotExist()
    }
}
