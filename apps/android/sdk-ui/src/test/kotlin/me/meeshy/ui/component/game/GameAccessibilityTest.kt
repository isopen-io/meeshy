package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameAccessibilityTest {

    @get:Rule
    val rule = createComposeRule()

    private fun hostWith(label: String?) = rule.setContent {
        Box(Modifier.testTag("brick").gameAccessibility(label)) {
            Box(Modifier.testTag("inner").semantics { contentDescription = "dessin interne" })
        }
    }

    @Test
    fun `sans libelle la brique est decorative`() {
        hostWith(null)
        val config = rule.onNodeWithTag("brick").fetchSemanticsNode().config
        assertThat(config.contains(SemanticsProperties.ContentDescription)).isFalse()
        assertThat(config.contains(SemanticsProperties.Role)).isFalse()
    }

    @Test
    fun `sans libelle les dessins internes sont ignores`() {
        hostWith(null)
        rule.onNodeWithTag("inner", useUnmergedTree = false).assertDoesNotExist()
    }

    @Test
    fun `avec un libelle la brique est UN element image`() {
        hostWith("Niveau 34")
        val config = rule.onNodeWithTag("brick").fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.ContentDescription]).containsExactly("Niveau 34")
        assertThat(config[SemanticsProperties.Role]).isEqualTo(Role.Image)
    }

    @Test
    fun `avec un libelle les dessins internes restent ignores`() {
        hostWith("Niveau 34")
        rule.onNodeWithTag("inner").assertDoesNotExist()
    }
}
