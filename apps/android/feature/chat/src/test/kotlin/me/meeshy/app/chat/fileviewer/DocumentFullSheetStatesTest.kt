package me.meeshy.app.chat.fileviewer

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** La fiche d'un document : aperçu indisponible avec nom et poids, et un contenu protégé qui ne laisse rien sortir. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DocumentFullSheetStatesTest {

    @get:Rule
    val compose = createComposeRule()

    private fun request(protected: Boolean = false, size: Int? = null) = FileViewerRequest(
        fileName = "rapport.docx",
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        localUri = "content://dl/1",
        isProtected = protected,
        sizeBytes = size,
    )

    @Test
    fun `l'apercu indisponible dit le nom et le poids du document`() {
        compose.setContent { MeeshyTheme { DocumentViewerSheet(request(size = 2048), isPdf = false, accent = Color.Blue, onDismiss = {}) } }

        compose.onAllNodesWithText("rapport.docx").assertCountEquals(2)
        compose.onAllNodesWithText("rapport.docx").onFirst().assertIsDisplayed()
        compose.onAllNodesWithText("rapport.docx").onLast().assertIsDisplayed()
        compose.onNodeWithText("Preview unavailable").assertIsDisplayed()
        compose.onNode(hasText("KB", substring = true, ignoreCase = true)).assertIsDisplayed()
    }

    @Test
    fun `un document ordinaire offre de le telecharger et de le partager`() {
        compose.setContent { MeeshyTheme { DocumentViewerSheet(request(), isPdf = false, accent = Color.Blue, onDismiss = {}) } }

        compose.onNode(hasContentDescription("Download document")).assertIsDisplayed()
        compose.onNode(hasContentDescription("Share")).assertIsDisplayed()
    }

    @Test
    fun `un document protege n'offre ni telechargement ni partage ni ouverture ailleurs`() {
        compose.setContent { MeeshyTheme { DocumentViewerSheet(request(protected = true), isPdf = false, accent = Color.Blue, onDismiss = {}) } }

        compose.onNodeWithText("Preview unavailable").assertIsDisplayed()
        compose.onNode(hasContentDescription("Download document")).assertDoesNotExist()
        compose.onNode(hasContentDescription("Share")).assertDoesNotExist()
        compose.onNode(hasText("Open with another app")).assertDoesNotExist()
    }
}
