package me.meeshy.app.auth

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class WelcomeScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(onCreate: () -> Unit = {}, onSignIn: () -> Unit = {}) {
        compose.setContent { MeeshyTheme { WelcomeScreen(onCreateAccount = onCreate, onSignIn = onSignIn) } }
        compose.waitForIdle()
    }

    @Test
    fun `l'accueil montre la promesse et les deux boutons`() {
        show()

        compose.onNodeWithText("Meeshy").assertIsDisplayed()
        compose.onNodeWithText("Every message, in your language.").assertIsDisplayed()
        compose.onNodeWithText("Create account").assertIsDisplayed()
        compose.onNodeWithText("Sign in").assertIsDisplayed()
    }

    @Test
    fun `les deux boutons font au moins 52 dp de haut`() {
        show()

        compose.onNodeWithTag(WELCOME_CREATE_ACCOUNT_TAG).assertHeightIsAtLeast(52.dp)
        compose.onNodeWithTag(WELCOME_SIGN_IN_TAG).assertHeightIsAtLeast(52.dp)
    }

    @Test
    fun `chaque bouton declenche sa seule action`() {
        var created = 0
        var signedIn = 0
        show(onCreate = { created++ }, onSignIn = { signedIn++ })

        compose.onNodeWithTag(WELCOME_CREATE_ACCOUNT_TAG).performClick()
        assertThat(created to signedIn).isEqualTo(1 to 0)

        compose.onNodeWithTag(WELCOME_SIGN_IN_TAG).performClick()
        assertThat(created to signedIn).isEqualTo(1 to 1)
    }
}
