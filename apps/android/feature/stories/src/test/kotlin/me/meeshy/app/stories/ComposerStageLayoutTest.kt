package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La scène du composer garde sa taille quand un outil s'ouvre, et ses réglages de texte
 * vivent hors d'elle (#12298) — iOS `ComposerRailGeometry.sceneWidth` ne dépend que de la
 * largeur utile, jamais de la bande basse, et aucun contrôle ne se pose sur la scène.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerStageLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private fun setStage(panelOpen: () -> Boolean) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 400.dp, height = 800.dp)) {
                    ComposerStage(
                        scene = { modifier -> Box(modifier.testTag(SCENE)) },
                        footer = { Box(Modifier.fillMaxWidth().height(56.dp).testTag(FOOTER)) },
                        panel = {
                            if (panelOpen()) Box(Modifier.fillMaxWidth().height(320.dp).testTag(PANEL))
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }

    @Test
    fun `opening a tool panel leaves the scene at its size`() {
        var open by mutableStateOf(false)
        setStage { open }
        val closed = compose.onNodeWithTag(SCENE).getUnclippedBoundsInRoot()

        open = true
        compose.waitForIdle()

        compose.onNodeWithTag(PANEL).assertExists()
        assertThat(compose.onNodeWithTag(SCENE).getUnclippedBoundsInRoot()).isEqualTo(closed)
    }

    @Test
    fun `what accompanies the scene sits below it, never on it`() {
        setStage { false }

        val scene = compose.onNodeWithTag(SCENE).getUnclippedBoundsInRoot()
        val footer = compose.onNodeWithTag(FOOTER).getUnclippedBoundsInRoot()

        assertThat(footer.top).isAtLeast(scene.bottom)
    }

    @Test
    fun `the text settings hold in a single scrolling row`() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(400.dp)) {
                    TextStyleToolbar(
                        element = StoryTextElement(id = "t", text = "Bonjour"),
                        onStyle = {}, onColor = {}, onAlign = {}, onBackground = {},
                        onCycleSize = {}, onCycleOutline = {}, onCycleFadeIn = {}, onCycleFadeOut = {},
                        onCycleStart = {}, onCycleDuration = {}, onDuplicate = {}, onReorder = {},
                        modifier = Modifier.testTag(TOOLBAR),
                    )
                }
            }
        }

        val toolbar = compose.onNodeWithTag(TOOLBAR).getUnclippedBoundsInRoot()

        assertThat(toolbar.bottom - toolbar.top).isAtMost(64.dp)
    }

    private companion object {
        const val SCENE = "scene"
        const val FOOTER = "footer"
        const val PANEL = "panel"
        const val TOOLBAR = "toolbar"
    }
}
