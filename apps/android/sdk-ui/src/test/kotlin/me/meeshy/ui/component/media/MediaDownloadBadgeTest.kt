package me.meeshy.ui.component.media

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaAvailabilityState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaDownloadBadgeTest {
    @get:Rule
    val rule = createComposeRule()

    private var downloads = 0
    private var cancels = 0

    private fun show(state: MediaAvailabilityState) {
        rule.setContent { MediaDownloadBadge(state, Color.Blue, { downloads++ }, { cancels++ }) }
    }

    private fun count(description: String) =
        rule.onAllNodes(hasContentDescription(description)).fetchSemanticsNodes().size

    @Test
    fun `une piece prete ne dessine aucun badge`() {
        show(MediaAvailabilityState.Ready)
        assertThat(count("Download")).isEqualTo(0)
        assertThat(count("Cancel download")).isEqualTo(0)
        assertThat(count("Retry")).isEqualTo(0)
    }

    @Test
    fun `a telecharger dit Telecharger avec la taille et lance le telechargement`() {
        show(MediaAvailabilityState.NeedsDownload(850 * 1024L))
        rule.onNodeWithContentDescription("Download").performClick()
        assertThat(downloads).isEqualTo(1)
    }

    @Test
    fun `hors ligne le badge est desactive et dit Hors ligne`() {
        show(MediaAvailabilityState.NeedsDownload(850 * 1024L, offline = true))
        val node = rule.onNodeWithContentDescription("Download").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Offline")
        assertThat(node.config.contains(SemanticsProperties.Disabled)).isTrue()
        assertThat(downloads).isEqualTo(0)
    }

    @Test
    fun `en cours annonce les octets et un toucher annule`() {
        show(MediaAvailabilityState.Downloading(410 * 1024L, 850 * 1024L))
        val node = rule.onNodeWithContentDescription("Cancel download").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("410 KB / 850 KB, 48%")
        rule.onNodeWithContentDescription("Cancel download").performClick()
        assertThat(cancels).isEqualTo(1)
    }

    @Test
    fun `un echec dit Reessayer et relance`() {
        show(MediaAvailabilityState.Failed())
        rule.onNodeWithContentDescription("Retry").performClick()
        assertThat(downloads).isEqualTo(1)
    }
}
