package me.meeshy.ui.component.focal

import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
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
    fun `un message long montre l'extrait de la loi puis le texte entier au toucher`() {
        val shown = mutableListOf<String>()
        compose.setContent {
            FocalLongMessage("m1", long, Color.Blue, expansion = null) { shown += it; Text(it) }
        }
        assertThat(shown.last().endsWith("…")).isTrue()
        assertThat(shown.last().length).isLessThan(long.length)

        compose.onNodeWithText("Read more").performClick()
        compose.waitForIdle()

        assertThat(shown.last()).isEqualTo(long)
        compose.onNodeWithText("Show less").assertIsDisplayed()
    }

    @Test
    fun `sous un hote l'etat vient de l'expansion et le toucher la bascule`() {
        var toggled = 0
        compose.setContent {
            FocalLongMessage("m1", long, Color.Blue, expansion = FlatRowExpansion(isExpanded = true) { toggled++ }) { Text(it) }
        }

        compose.onNodeWithText("Show less").performClick()

        assertThat(toggled).isEqualTo(1)
        compose.onNodeWithText(long).assertIsDisplayed()
    }
}
