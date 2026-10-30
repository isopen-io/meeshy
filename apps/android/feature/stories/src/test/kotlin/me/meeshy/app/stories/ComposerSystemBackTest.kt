package me.meeshy.app.stories

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le retour système quitte d'abord le geste en cours (#13838) : une feuille ouverte se referme, puis un panneau ouvert
 * (outil, durée, légende) ; seulement ensuite, un brouillon non vide demande « Fermer le brouillon ? ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerSystemBackTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private class Calls {
        var kept = 0
        var sheetClosed = 0
        var panelClosed = 0
    }

    private fun show(hasContent: Boolean, sheetOpen: Boolean = false, panelOpen: Boolean = false): Calls {
        val calls = Calls()
        compose.setContent {
            MeeshyTheme {
                val close = rememberConfirmedComposerClose(
                    hasContent = hasContent,
                    editingPublished = false,
                    onKeep = { calls.kept++ },
                    onDiscard = {},
                )
                ComposerBackHandlers(
                    close = close,
                    onClosePanel = if (panelOpen) ({ calls.panelClosed++ }) else null,
                    onCloseSheet = if (sheetOpen) ({ calls.sheetClosed++ }) else null,
                )
            }
        }
        return calls
    }

    private fun pressBack() {
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
    }

    @Test
    fun `back on a draft with content asks before closing`() {
        val calls = show(hasContent = true)

        pressBack()

        compose.onNodeWithText(TITLE).assertExists()
        assertThat(calls.kept).isEqualTo(0)
    }

    @Test
    fun `back with a panel open closes the panel and asks nothing`() {
        val calls = show(hasContent = true, panelOpen = true)

        pressBack()

        assertThat(calls.panelClosed).isEqualTo(1)
        compose.onNodeWithText(TITLE).assertDoesNotExist()
    }

    @Test
    fun `back with a sheet open closes the sheet before the panel`() {
        val calls = show(hasContent = true, sheetOpen = true, panelOpen = true)

        pressBack()

        assertThat(calls.sheetClosed).isEqualTo(1)
        assertThat(calls.panelClosed).isEqualTo(0)
        compose.onNodeWithText(TITLE).assertDoesNotExist()
    }

    private companion object {
        const val TITLE = "Close the draft?"
    }
}
