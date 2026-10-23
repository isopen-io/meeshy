package me.meeshy.ui.component.imageedit

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w400dp-h300dp-mdpi")
class CropOverlayAccessibilityTest {
    @get:Rule val compose = createComposeRule()

    private fun node(label: String) = compose.onNode(
        SemanticsMatcher("label=$label") { it.config.getOrNull(SemanticsProperties.ContentDescription)?.contains(label) == true },
    )

    private fun actionLabels(label: String): List<String> =
        node(label).fetchSemanticsNode().config[SemanticsActions.CustomActions].map { it.label }

    @Test fun `les valeurs vocalisees sont des pourcentages de largeur et de hauteur`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        val state = node("Top left corner").fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription)
        assertThat(state).isEqualTo("Width 50%, height 50%")
    }

    @Test fun `le cadre expose agrandir reduire et les quatre deplacements`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        assertThat(actionLabels("Crop frame")).containsExactly(
            "Grow the crop frame", "Shrink the crop frame",
            "Move left", "Move right", "Move up", "Move down",
        )
    }

    @Test fun `agrandir un coin applique un pas de un pour cent`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        val action = node("Bottom right corner").fetchSemanticsNode().config[SemanticsActions.CustomActions].first()
        compose.runOnIdle { action.action() }
        compose.waitForIdle()
        assertThat(h.rect.width).isWithin(1e-3f).of(204f)
        assertThat(h.interactions).isEqualTo(1)
    }

    @Test fun `en mode ratio les bords disparaissent de l'arbre`() {
        val h = CropHarness()
        compose.setContent { h.Content(aspectRatio = 1.0) }
        compose.onNode(SemanticsMatcher("none") { it.config.getOrNull(SemanticsProperties.ContentDescription)?.contains("Top edge") == true }).assertDoesNotExist()
    }
}

