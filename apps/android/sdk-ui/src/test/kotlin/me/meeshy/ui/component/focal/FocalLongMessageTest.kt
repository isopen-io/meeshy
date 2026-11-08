package me.meeshy.ui.component.focal

import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalLongMessageTest {

    @get:Rule
    val compose = createComposeRule()

    private val long = "abcd ".repeat(200).trim()
    private val short = "bonjour"

    @Test
    fun `un message court n'offre ni lire la suite ni reduire`() {
        compose.setContent {
            FocalLongMessage("m1", short, Color.Blue, expansion = null) { Text(it) }
        }

        compose.onNodeWithText(short).assertIsDisplayed()
        compose.onNodeWithText("Read more").assertDoesNotExist()
        compose.onNodeWithText("Show less").assertDoesNotExist()
    }

    @Test
    fun `#16465 un message long montre l'extrait puis le texte entier au toucher, sans aucun controle de repli`() {
        val shown = mutableListOf<String>()
        compose.setContent {
            FocalLongMessage("m1", long, Color.Blue, expansion = null) { shown += it; Text(it) }
        }
        assertThat(shown.last().endsWith("…")).isTrue()
        assertThat(shown.last().length).isLessThan(long.length)

        compose.onNodeWithText("Read more").performClick()
        compose.waitForIdle()

        assertThat(shown.last()).isEqualTo(long)
        compose.onNodeWithText("Show less").assertDoesNotExist()
        compose.onNodeWithText("Read more").assertDoesNotExist()
    }

    @Test
    fun `#16465 sous un hote, un message deplie est rendu entier et n'offre aucun bouton`() {
        compose.setContent {
            FocalLongMessage("m1", long, Color.Blue, expansion = FlatRowExpansion(isExpanded = true) {}) { Text(it) }
        }

        compose.onNodeWithText(long).assertIsDisplayed()
        compose.onNodeWithText("Show less").assertDoesNotExist()
        compose.onNodeWithText("Read more").assertDoesNotExist()
    }

    @Test
    fun `sous un hote, deplier passe par l'expansion`() {
        var toggled = 0
        compose.setContent {
            FocalLongMessage("m1", long, Color.Blue, expansion = FlatRowExpansion(isExpanded = false) { toggled++ }) { Text(it) }
        }

        compose.onNodeWithText("Read more").performClick()

        assertThat(toggled).isEqualTo(1)
    }

    @Test
    fun `le lien annonce son etat et offre une cible d'au moins 48 dp`() {
        compose.setContent {
            FocalLongMessage("m1", long, Color.Blue, expansion = FlatRowExpansion(isExpanded = false) {}) { Text(it) }
        }

        compose.onNodeWithText("Read more")
            .assertHeightIsAtLeast(48.dp)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Collapsed"))
    }
}
