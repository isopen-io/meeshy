package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13897 — l'export se suit dans un BANDEAU qui ne bloque rien, comme sur le web : sa progression et « Annuler », posés en
 * bas, dans une fenêtre qui ne prend ni le focus ni les gestes de l'écran. Aucune fenêtre modale ; la scène qu'on peint
 * voyage avec le bandeau, invisible.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class SceneExportBandComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a running export shows a band with its progress and cancel, never a modal window`() {
        var cancels = 0
        compose.setContent { SceneExportBand(fraction = 0.4f, onCancel = { cancels++ }) }

        compose.onNodeWithText("Exporting…").assertExists()
        compose.onAllNodes(isDialog()).assertCountEquals(0)
        compose.onAllNodes(isPopup()).assertCountEquals(1)
        compose.onNodeWithText("Cancel").performClick()

        assertThat(cancels).isEqualTo(1)
    }

    @Test
    fun `the scene being painted travels with the band`() {
        compose.setContent {
            SceneExportBand(fraction = 0f, onCancel = {}, painting = { Box(Modifier.testTag("peintre")) })
        }

        compose.onNodeWithTag("peintre").assertExists()
        compose.onAllNodes(isDialog()).assertCountEquals(0)
    }

    @Test
    fun `no export, no band`() {
        compose.setContent { SceneExportBand(fraction = null, onCancel = {}) }

        compose.onAllNodes(isPopup()).assertCountEquals(0)
        compose.onNodeWithText("Exporting…").assertDoesNotExist()
    }
}
