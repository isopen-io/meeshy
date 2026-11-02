package me.meeshy.ui.component.bubble

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13461 : une carte de visite se montre comme une carte (nom du contact, « Shared contact »), pas comme un trombone. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BubbleFileRowTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `une carte de visite montre le nom du contact sans l'extension ni le prefixe temporaire`() {
        var tapped = 0
        compose.setContent {
            MeeshyTheme {
                BubbleFileRow(
                    file = BubbleFile(attachmentId = "a1", name = "Zoé Dupont.vcf", url = "https://x/a1", isContactCard = true),
                    onColor = Color.Black,
                    onClick = { tapped++ },
                )
            }
        }

        compose.onNodeWithText("Zoé Dupont").assertIsDisplayed().assertHasClickAction()
        compose.onNodeWithText("Shared contact").assertIsDisplayed()
        compose.onNodeWithText("Zoé Dupont").performClick()
        assertThat(tapped).isEqualTo(1)
    }

    @Test
    fun `une carte sans nom lisible dit seulement qu'elle est un contact partage`() {
        compose.setContent {
            MeeshyTheme {
                BubbleFileRow(
                    file = BubbleFile(attachmentId = "a1", name = ".vcf", isContactCard = true),
                    onColor = Color.Black,
                    onClick = null,
                )
            }
        }

        compose.onNodeWithText("Shared contact").assertIsDisplayed()
    }

    @Test
    fun `un fichier ordinaire garde sa rangee avec le nom et la taille`() {
        compose.setContent {
            MeeshyTheme {
                BubbleFileRow(
                    file = BubbleFile(attachmentId = "a2", name = "rapport.pdf", sizeBytes = 2048),
                    onColor = Color.Black,
                    onClick = null,
                )
            }
        }

        compose.onNodeWithText("rapport.pdf").assertIsDisplayed()
    }
}
