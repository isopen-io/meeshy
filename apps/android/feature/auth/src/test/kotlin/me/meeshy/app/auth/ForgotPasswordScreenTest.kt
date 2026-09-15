package me.meeshy.app.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * « Mot de passe oublié » sert aussi à CRÉER un premier mot de passe (#6645, #6642).
 *
 * Un compte ouvert par e-mail n'a jamais eu de mot de passe : l'écran ne parle donc
 * pas de « réinitialiser », il dit qu'un lien permet d'en CHOISIR un, et le (i)
 * « Jamais eu de mot de passe ? » lève le doute sans l'imposer à tout le monde.
 * Une fois le lien parti, l'écran se lit comme celui de la connexion par e-mail :
 * mêmes mots, même aide aux indésirables.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ForgotPasswordScreenTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the request says a link lets you choose a password, and unfolds the first-password case`() {
        show(mockk(relaxed = true))

        compose.onNodeWithText("Forgot password").assertIsDisplayed()
        compose.onNodeWithText("Get a link by email to choose a new password.").assertIsDisplayed()
        compose.onNodeWithText("Get the link").assertIsDisplayed()
        compose.onNodeWithText("The same link lets you create one.").assertDoesNotExist()

        compose.onNodeWithText("Never had a password?").performClick()

        compose.onNodeWithText("The same link lets you create one.").assertIsDisplayed()
    }

    @Test
    fun `once sent, the screen reads like the email sign-in confirmation`() {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.requestPasswordReset(any()) } returns NetworkResult.Success(Unit)
        show(repository)

        compose.onNode(hasSetTextAction()).performTextInput("ada@example.com")
        compose.onNodeWithText("Get the link").performClick()
        compose.waitUntil { compose.onAllNodesWithText("Email sent").fetchSemanticsNodes().isNotEmpty() }

        compose.onNodeWithText("Open the link sent to ada@example.com").assertIsDisplayed()
        compose.onNodeWithText("Nothing received?").assertIsDisplayed()
        compose.onNodeWithText("Back to login").assertIsDisplayed()
    }

    private fun show(repository: AuthRepository) {
        compose.setContent {
            MeeshyTheme { ForgotPasswordScreen(onBack = {}, viewModel = ForgotPasswordViewModel(repository)) }
        }
        compose.waitForIdle()
    }
}
