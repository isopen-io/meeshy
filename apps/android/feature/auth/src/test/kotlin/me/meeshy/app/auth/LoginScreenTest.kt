package me.meeshy.app.auth

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.awaitCancellation
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.net.InMemoryServerEnvironmentStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private const val LOGIN = "Log in"

/** Le repère du spinner de AuthActionButton (sdk-ui, interne à son module). */
private const val AUTH_ACTION_SPINNER_TAG = "auth.action.spinner"
private const val SHOW_PASSWORD = "Show password"

/** L'écran de connexion : bouton, œil, spinner d'envoi et sélecteur d'environnement. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class LoginScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private fun viewModel(
        repository: AuthRepository = mockk<AuthRepository>(relaxed = true).also {
            coEvery { it.restoreBackedUpSession() } returns null
        },
    ): AuthViewModel {
        return AuthViewModel(
            repository,
            mockk(relaxed = true),
            InMemorySavedAccountsStore(),
            object : CacheClock {
                override fun nowMillis(): Long = 0L
            },
            MeeshyConfig(),
            InMemoryServerEnvironmentStore(),
        )
    }

    private fun show(viewModel: AuthViewModel) {
        compose.setContent { MeeshyTheme { LoginScreen(viewModel = viewModel, onAuthenticated = {}) } }
        compose.waitForIdle()
    }

    @Test
    fun `the login button is disabled while a field is empty and enabled once both are filled`() {
        val viewModel = viewModel()
        show(viewModel)

        compose.onNodeWithContentDescription(LOGIN).assertIsNotEnabled()

        viewModel.onUsernameChange("ada")
        compose.waitForIdle()
        compose.onNodeWithContentDescription(LOGIN).assertIsNotEnabled()

        viewModel.onPasswordChange("secret")
        compose.waitForIdle()
        compose.onNodeWithContentDescription(LOGIN).assertIsEnabled()
    }

    @Test
    fun `a spinner replaces the label while the credentials are being sent`() {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.restoreBackedUpSession() } returns null
        coEvery { repository.loginOutcome(any(), any(), any()) } coAnswers { awaitCancellation() }
        val viewModel = viewModel(repository)
        show(viewModel)
        viewModel.onUsernameChange("ada")
        viewModel.onPasswordChange("secret")
        compose.waitForIdle()
        compose.onAllNodesWithTag(AUTH_ACTION_SPINNER_TAG, useUnmergedTree = true).assertCountEquals(0)

        compose.onNodeWithContentDescription(LOGIN).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(AUTH_ACTION_SPINNER_TAG, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `the eye button reveals then masks the password and announces its state`() {
        show(viewModel())

        compose.onNodeWithContentDescription(SHOW_PASSWORD).performClick()
        compose.waitForIdle()

        assertThat(compose.onAllNodesWithContentDescription(SHOW_PASSWORD).fetchSemanticsNodes()).isEmpty()
        compose.onNodeWithContentDescription("Hide password").performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription(SHOW_PASSWORD).assertExists()
    }

    @Test
    fun `typing in the identifier field reaches the state`() {
        val viewModel = viewModel()
        show(viewModel)

        compose.onAllNodes(hasSetTextAction())[0].performTextInput("ada")

        assertThat(viewModel.state.value.username).isEqualTo("ada")
    }
}
