package me.meeshy.ui.component.media

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.DownloadBadgeState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadBadgeSemanticsTest {
    @get:Rule
    val rule = createComposeRule()

    private fun show(state: DownloadBadgeState, onDownload: () -> Unit = {}, onCancel: () -> Unit = {}) {
        rule.setContent { DownloadBadge(state, Color.Blue, onDownload, onCancel) }
    }

    @Test
    fun `l'etat repos dit Telecharger et declenche le telechargement`() {
        var downloads = 0
        show(DownloadBadgeState.Idle(2_048), onDownload = { downloads++ })
        rule.onNodeWithContentDescription("Download").assertContentDescriptionEquals("Download").performClick()
        assertThat(downloads).isEqualTo(1)
    }

    @Test
    fun `l'etat en cours dit Annuler le telechargement et annule`() {
        var cancels = 0
        show(DownloadBadgeState.Downloading(25, 512, 2_048), onCancel = { cancels++ })
        rule.onNodeWithContentDescription("Cancel download").performClick()
        assertThat(cancels).isEqualTo(1)
    }

    @Test
    fun `un media deja en cache ne dessine rien`() {
        show(DownloadBadgeState.Hidden)
        rule.onAllNodesWithDescriptionCount("Download", 0)
        rule.onAllNodesWithDescriptionCount("Cancel download", 0)
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithDescriptionCount(text: String, expected: Int) {
        assertThat(onAllNodes(hasContentDescription(text)).fetchSemanticsNodes()).hasSize(expected)
    }
}
