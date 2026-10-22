package me.meeshy.app.auth

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
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
 * Le (i) des écrans d'accès : une ligne visible, le détail derrière, un tic léger à chaque
 * ouverture ou fermeture, et — REPLIÉ ne voulant pas dire ABSENT — le texte porté par le
 * bouton pour le lecteur d'écran tant qu'il est caché (iOS `accessibilityValue`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AuthInfoDisclosureTest {

    @get:Rule
    val compose = createComposeRule()

    private class RecordingHaptics : HapticFeedback {
        val performed = mutableListOf<HapticFeedbackType>()
        override fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType) {
            performed += hapticFeedbackType
        }
    }

    private val explanation = "The same link lets you create one."

    private fun show(haptics: RecordingHaptics, title: String? = null) {
        compose.setContent {
            CompositionLocalProvider(LocalHapticFeedback provides haptics) {
                MeeshyTheme {
                    AuthInfoDisclosure(label = "Never had a password?", text = explanation, title = title)
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `opening the detail gives a light tap and shows it`() {
        val haptics = RecordingHaptics()
        show(haptics)

        compose.onNodeWithText("Never had a password?").performClick()

        assertThat(haptics.performed).hasSize(1)
        compose.onNodeWithText(explanation).assertExists()
    }

    @Test
    fun `closing the detail gives a second light tap and hides it`() {
        val haptics = RecordingHaptics()
        show(haptics)

        compose.onNodeWithText("Never had a password?").performClick()
        compose.onNodeWithText("Never had a password?").performClick()

        assertThat(haptics.performed).hasSize(2)
        compose.onNodeWithText(explanation).assertDoesNotExist()
    }

    @Test
    fun `folded, the button carries the detail as its state for the screen reader`() {
        show(RecordingHaptics())

        val state = compose.onNodeWithText("Never had a password?").fetchSemanticsNode()
            .config.getOrNull(SemanticsProperties.StateDescription)

        assertThat(state).isEqualTo(explanation)
    }

    @Test
    fun `unfolded, the detail is read where it is and not repeated as a state`() {
        show(RecordingHaptics())

        compose.onNodeWithText("Never had a password?").performClick()

        val state = compose.onNodeWithText("Never had a password?").fetchSemanticsNode()
            .config.getOrNull(SemanticsProperties.StateDescription)
        assertThat(state).isNull()
    }

    @Test
    fun `with a title the info button is announced by its label and also taps lightly`() {
        val haptics = RecordingHaptics()
        show(haptics, title = "Forgot password")

        compose.onNodeWithContentDescription("Never had a password?").performClick()

        assertThat(haptics.performed).hasSize(1)
        compose.onNodeWithText(explanation).assertExists()
    }
}
