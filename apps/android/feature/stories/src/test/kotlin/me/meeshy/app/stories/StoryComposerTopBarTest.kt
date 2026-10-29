package me.meeshy.app.stories

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La barre du haut comme iOS : pas de titre, publier en action compacte, cible de 48 dp nommée pour TalkBack (#13639). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryComposerTopBarTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `publish is a named touch target of at least 48 dp that fires when enabled`() {
        var clicks = 0
        compose.setContent { StoryPublishAction(label = "Publier la story", enabled = true, onClick = { clicks++ }) }
        val node = compose.onNodeWithContentDescription("Publier la story")
        node.assertIsEnabled().assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
        assertThat(clicks).isEqualTo(1)
    }

    @Test
    fun `publish stays named but inert when the story cannot be published`() {
        compose.setContent { StoryPublishAction(label = "Publier la story", enabled = false, onClick = {}) }
        compose.onNodeWithContentDescription("Publier la story").assertIsNotEnabled()
    }
}
