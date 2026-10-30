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
 * Les réglages d'un texte tiennent dans une seule rangée défilante (#12298). La géographie de la scène elle-même — plein
 * écran, contrôles posés dessus, réduite entière au-dessus d'un panneau — est gardée par [StorySceneFirstLayoutTest] (#13834).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerStageLayoutTest {

    @get:Rule
    val compose = createComposeRule()

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
        const val TOOLBAR = "toolbar"
    }
}
