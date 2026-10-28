package me.meeshy.app.chat.fileviewer

import android.net.Uri
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
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

/** #13461 : chaque type de pièce-fichier s'ouvre dans l'app, avec ses états (chargement, erreur) et ses actions. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class FileViewerSheetsTest {

    @get:Rule
    val compose = createComposeRule()

    @get:Rule
    val folder = TemporaryFolder()

    private fun request(name: String, mime: String, bytes: ByteArray): FileViewerRequest {
        val file = File(folder.root, name).apply { writeBytes(bytes) }
        return FileViewerRequest(fileName = name, mimeType = mime, localUri = Uri.fromFile(file).toString())
    }

    private val card = """
        BEGIN:VCARD
        VERSION:3.0
        FN:Zoé Dupont
        ORG:Meeshy
        TEL;TYPE=CELL:+33612345678
        EMAIL;TYPE=HOME:zoe@example.com
        NOTE:Une note
        END:VCARD
    """.trimIndent()

    @Test
    fun `la fiche d'une carte liste tous les champs et offre l'ajout aux contacts`() {
        val request = request("Zoé.vcf", "text/vcard", card.toByteArray())
        compose.setContent { MeeshyTheme { ContactCardSheet(request, Color.Blue, onDismiss = {}) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Zoé Dupont")).fetchSemanticsNodes().isNotEmpty() }

        compose.onNode(hasContentDescription("+33612345678", substring = true)).assertIsDisplayed()
        compose.onNode(hasContentDescription("zoe@example.com", substring = true)).assertIsDisplayed()
        compose.onNode(hasContentDescription("Une note", substring = true)).assertIsDisplayed()
        compose.onNodeWithText("Add to Contacts").assertIsDisplayed()
    }

    @Test
    fun `un fichier qui n'est pas une carte est dit illisible et se ferme par sa croix`() {
        var closed = false
        val request = request("x.vcf", "text/vcard", "pas une carte".toByteArray())
        compose.setContent { MeeshyTheme { ContactCardSheet(request, Color.Blue, onDismiss = { closed = true }) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Unreadable contact")).fetchSemanticsNodes().isNotEmpty() }

        compose.onNodeWithContentDescription("Close contact card").performClick()
        compose.runOnIdle { assert(closed) }
    }

    @Test
    fun `un fichier de code montre son nom son langage et ses numeros de ligne`() {
        val request = request("main.kt", "text/plain", "fun main() {\n    val x = 42\n}".toByteArray())
        compose.setContent { MeeshyTheme { CodeViewerSheet(request, me.meeshy.sdk.model.fileviewer.CodeLanguage.KOTLIN, Color.Blue, onDismiss = {}) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("    val x = 42", substring = true)).fetchSemanticsNodes().isNotEmpty() }

        compose.onNodeWithText("main.kt").assertIsDisplayed()
        compose.onNodeWithText("Kotlin").assertIsDisplayed()
        compose.onNodeWithText("fun main() {").assertIsDisplayed()
        compose.onNodeWithContentDescription("Copy").assertIsDisplayed()
    }

    @Test
    fun `un contenu binaire pris pour du code est refuse sans rien afficher`() {
        val request = request("a.js", "text/plain", byteArrayOf(0x50, 0x4B, 0x00, 0x01))
        compose.setContent { MeeshyTheme { CodeViewerSheet(request, me.meeshy.sdk.model.fileviewer.CodeLanguage.JAVASCRIPT, Color.Blue, onDismiss = {}) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Unable to load file")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun `un document sans apercu le dit et garde enregistrer et partager`() {
        val request = request("rapport.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ByteArray(8))
        compose.setContent { MeeshyTheme { DocumentViewerSheet(request, isPdf = false, accent = Color.Blue, onDismiss = {}) } }

        compose.onNodeWithText("Preview unavailable").assertIsDisplayed()
        compose.onNode(hasContentDescription("Download document")).assertIsDisplayed()
        compose.onNode(hasContentDescription("Share")).assertIsDisplayed()
    }

    @Test
    fun `un pdf illisible dit qu'il ne se charge pas`() {
        val request = request("casse.pdf", "application/pdf", "pas un pdf".toByteArray())
        compose.setContent { MeeshyTheme { DocumentViewerSheet(request, isPdf = true, accent = Color.Blue, onDismiss = {}) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Unable to load file")).fetchSemanticsNodes().isNotEmpty() }
    }
}
