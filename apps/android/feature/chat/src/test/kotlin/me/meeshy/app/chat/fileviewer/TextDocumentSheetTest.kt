package me.meeshy.app.chat.fileviewer

import android.net.Uri
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import java.io.File
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13496 : un texte brut ou du Markdown se lit dans l'app, borné, sans rien exécuter. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TextDocumentSheetTest {

    @get:Rule val compose = createComposeRule()
    @get:Rule val folder = TemporaryFolder()

    private fun request(name: String, mime: String, bytes: ByteArray): FileViewerRequest {
        val file = File(folder.root, name).apply { writeBytes(bytes) }
        return FileViewerRequest(name, mime, Uri.fromFile(file).toString())
    }

    @Test
    fun `un texte brut Windows-1252 se lit avec ses accents`() {
        val request = request("notes.txt", "text/plain", "Réunion à 15h – café".toByteArray(charset("windows-1252")))
        compose.setContent { MeeshyTheme { TextDocumentSheet(request, isMarkdown = false, accent = Color.Blue, onDismiss = {}) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Réunion à 15h – café")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Réunion à 15h – café").assertIsDisplayed()
    }

    @Test
    fun `le markdown est rendu puis montre sa source a la demande`() {
        val request = request("README.md", "text/markdown", "# Titre\n\nun **gras** mot".toByteArray())
        compose.setContent { MeeshyTheme { TextDocumentSheet(request, isMarkdown = true, accent = Color.Blue, onDismiss = {}) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Titre")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Titre").assertIsDisplayed()
        compose.onNodeWithContentDescription("Show source").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("# Titre")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("# Titre").assertIsDisplayed()
    }

    @Test
    fun `un fichier binaire est dit illisible et non affiche`() {
        val request = request("x.txt", "text/plain", byteArrayOf(0x41, 0x00, 0x42, 0x00))
        compose.setContent { MeeshyTheme { TextDocumentSheet(request, isMarkdown = false, accent = Color.Blue, onDismiss = {}) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Unable to load file")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Unable to load file").assertIsDisplayed()
    }
}
