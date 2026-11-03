package me.meeshy.app.auth

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.ServerEnvironment
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le sélecteur d'environnement extrait de l'écran : pastilles, champ d'hôte et origine comme avant. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EnvironmentSelectorTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(state: AuthUiState, onSelect: (ServerEnvironment) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                EnvironmentSelector(
                    state = state,
                    onSelect = onSelect,
                    onCustomHostChange = {},
                    onApplyCustomHost = {},
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `one pill per environment and the origin line are shown`() {
        show(AuthUiState(selectedEnvironment = ServerEnvironment.PRODUCTION))

        ServerEnvironment.entries.forEach { compose.onNodeWithText(it.label).assertExists() }
        compose.onNode(hasText("Connected to:", substring = true)).assertExists()
    }

    @Test
    fun `tapping a pill reports that environment`() {
        val picked = mutableListOf<ServerEnvironment>()
        show(AuthUiState(), onSelect = picked::add)

        compose.onNodeWithText(ServerEnvironment.STAGING.label).performClick()

        assertThat(picked).containsExactly(ServerEnvironment.STAGING)
    }

    @Test
    fun `the host field appears only for the custom environment`() {
        show(AuthUiState(selectedEnvironment = ServerEnvironment.PRODUCTION))
        compose.onAllNodes(hasSetTextAction()).assertCountEquals(0)
    }

    @Test
    fun `the host field is shown for the custom environment`() {
        show(AuthUiState(selectedEnvironment = ServerEnvironment.CUSTOM))
        compose.onAllNodes(hasSetTextAction()).assertCountEquals(1)
    }
}
