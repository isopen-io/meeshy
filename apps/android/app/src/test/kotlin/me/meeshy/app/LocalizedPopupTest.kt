package me.meeshy.app

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.feature.stories.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Un menu ou une fenêtre s'ouvre dans sa propre vue Compose, qui relit le contexte de l'Activity : la langue d'interface
 * choisie dans l'app doit l'atteindre aussi, sinon le menu ⋯ du compositeur parle la langue de l'appareil (#14860).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "fr")
class LocalizedPopupTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a dropdown menu speaks the interface language, not the device's`() {
        compose.setContent {
            LocalizedContent(languageCode = "es") {
                DropdownMenu(expanded = true, onDismissRequest = {}) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.composer_more_clear_all)) }, onClick = {})
                }
            }
        }

        compose.onNodeWithText("Borrar todo").assertExists()
    }

    @Test
    fun `a dialog speaks the interface language, not the device's`() {
        compose.setContent {
            LocalizedContent(languageCode = "es") {
                AlertDialog(
                    onDismissRequest = {},
                    confirmButton = { Text(stringResource(R.string.composer_more_clear_all)) },
                )
            }
        }

        compose.onNodeWithText("Borrar todo").assertExists()
    }

    @Test
    fun `back to the system language, a menu speaks the device's again`() {
        var language by mutableStateOf<String?>("es")
        var open by mutableStateOf(false)
        compose.setContent {
            LocalizedContent(languageCode = language) {
                DropdownMenu(expanded = open, onDismissRequest = {}) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.composer_more_clear_all)) }, onClick = {})
                }
            }
        }
        compose.waitForIdle()

        language = null
        compose.waitForIdle()
        open = true

        compose.onNodeWithText("Tout effacer").assertExists()
    }
}
