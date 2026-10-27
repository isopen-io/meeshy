package me.meeshy.app.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'erreur d'un écran d'accès entre quand un texte arrive et s'efface quand il disparaît. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AuthErrorMessageTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the message shows when text arrives and leaves when it is cleared`() {
        var text by mutableStateOf<String?>(null)
        compose.setContent { MeeshyTheme { AuthErrorMessage(text = text) } }

        compose.onNodeWithText("Wrong password").assertDoesNotExist()

        text = "Wrong password"
        compose.waitForIdle()
        compose.onNodeWithText("Wrong password").assertIsDisplayed()

        text = null
        compose.mainClock.advanceTimeBy(1_000)
        compose.waitForIdle()
        compose.onNodeWithText("Wrong password").assertDoesNotExist()
    }
}
