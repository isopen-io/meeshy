package me.meeshy.ui.component.bubble

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
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

    @Test
    fun `un PDF montre sa famille, sa taille et son nombre de pages`() {
        compose.setContent {
            MeeshyTheme {
                BubbleFileRow(
                    file = BubbleFile(attachmentId = "p", name = "rapport.pdf", sizeBytes = 2048, mimeType = "application/pdf", pageCount = 12),
                    onColor = Color.Black,
                    onClick = null,
                )
            }
        }

        compose.onNodeWithText("PDF", substring = true).assertIsDisplayed()
        compose.onNodeWithText("12 pages", substring = true).assertIsDisplayed()
    }

    @Test
    fun `un Word se distingue d'un PDF par son libelle de famille`() {
        compose.setContent {
            MeeshyTheme {
                BubbleFileRow(
                    file = BubbleFile(attachmentId = "w", name = "lettre.docx", mimeType = "application/octet-stream"),
                    onColor = Color.Black,
                    onClick = null,
                )
            }
        }

        compose.onNodeWithText("Word", substring = true).assertIsDisplayed()
    }

    @Test
    fun `un document sans nom montre le libelle de son type`() {
        compose.setContent {
            MeeshyTheme {
                BubbleFileRow(
                    file = BubbleFile(attachmentId = "n", name = null, mimeType = "application/vnd.ms-excel"),
                    onColor = Color.Black,
                    onClick = null,
                )
            }
        }

        val labels = compose.onAllNodesWithText("Excel")
        labels.assertCountEquals(2)
        labels.onFirst().assertIsDisplayed()
    }

    @Test
    fun `la carte du composer se supprime par sa croix etiquetee`() {
        var deleted = 0
        compose.setContent {
            MeeshyTheme {
                DocumentComposerCard(name = "a.pdf", mimeType = "application/pdf", onColor = Color.Black, onDelete = { deleted++ })
            }
        }

        compose.onNodeWithContentDescription("Delete attachment").assertHasClickAction().performClick()
        assertThat(deleted).isEqualTo(1)
    }

    @Test
    fun `la carte du composer sans suppression n'offre aucune croix`() {
        compose.setContent {
            MeeshyTheme { DocumentComposerCard(name = "a.pdf", mimeType = "application/pdf", onColor = Color.Black) }
        }

        compose.onNodeWithContentDescription("Delete attachment").assertDoesNotExist()
    }
}
