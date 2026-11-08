package me.meeshy.app.auth

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.input.ImeAction
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LoginTwoFactorStepTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun show(state: AuthUiState, onCancel: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                LoginTwoFactorStep(state = state, onCodeChange = {}, onSubmit = {}, onCancel = onCancel)
            }
        }
    }

    @Test
    fun `the sign in button stays disabled under six digits`() {
        show(AuthUiState(twoFactorToken = "t", twoFactorCode = "12345"))

        compose.onNodeWithText("Log in").assertIsNotEnabled()
    }

    @Test
    fun `the sign in button is enabled at six digits`() {
        show(AuthUiState(twoFactorToken = "t", twoFactorCode = "123456"))

        compose.onNodeWithText("Log in").assertIsEnabled()
    }

    @Test
    fun `the sign in button is enabled for a full backup code`() {
        show(AuthUiState(twoFactorToken = "t", twoFactorCode = "K7MP-Q2RX"))

        compose.onNodeWithText("Log in").assertIsEnabled()
    }

    @Test
    fun `the code field closes the keyboard with Done`() {
        show(AuthUiState(twoFactorToken = "t"))

        compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.ImeAction))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ImeAction, ImeAction.Done))
    }

    @Test
    fun `system back cancels the step`() {
        var cancelled = 0
        show(AuthUiState(twoFactorToken = "t"), onCancel = { cancelled++ })

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        org.junit.Assert.assertEquals(1, cancelled)
    }

    @Test
    fun `the step shows its title and description and cancel leaves it`() {
        var cancelled = 0
        show(AuthUiState(twoFactorToken = "t"), onCancel = { cancelled++ })

        compose.onNodeWithText("Two-Factor").assertExists()
        compose.onNodeWithText("Enter the 6-digit verification code from your authenticator app, or one of your backup codes.").assertExists()
        compose.onNodeWithText("Cancel").performClick()
        org.junit.Assert.assertEquals(1, cancelled)
    }
}
