package me.meeshy.ui.component.document

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.AnnotatedString
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import me.meeshy.sdk.model.fileviewer.CodeLanguage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CodeFullSheetStatesTest {

    @get:Rule
    val compose = createComposeRule()

    private fun sheet(content: CodeContent, exitAllowed: Boolean = true, clipboard: ClipboardManager = mockk(relaxed = true), onCopied: () -> Unit = {}) =
        compose.setContent {
            CompositionLocalProvider(LocalClipboardManager provides clipboard) {
                CodeFullSheet("Main.kt", CodeLanguage.KOTLIN, content, Color.Blue, isDark = true, onDismiss = {}, exitAllowed = exitAllowed, onCopied = onCopied)
            }
        }

    @Test
    fun `chargement affiche le libelle de chargement du fichier`() {
        sheet(CodeContent.Loading)
        compose.onNodeWithTag("code-sheet-status").assertIsDisplayed()
        compose.onNodeWithTag("code-sheet-status").assertTextEquals("Loading file...")
    }

    @Test
    fun `echec affiche l'erreur de chargement`() {
        sheet(CodeContent.Failed)
        compose.onNodeWithTag("code-sheet-status").assertTextEquals("Unable to load file")
    }

    @Test
    fun `copier met tout le source dans le presse-papiers`() {
        val clipboard = mockk<ClipboardManager>(relaxed = true)
        val copied = slot<AnnotatedString>()
        every { clipboard.setText(capture(copied)) } returns Unit
        var copiedCalls = 0
        sheet(CodeContent.Ready("val a = 1\nval b = 2"), clipboard = clipboard) { copiedCalls++ }
        compose.onNodeWithTag("Copy code").performSemanticsAction(SemanticsActions.OnClick)
        assertThat(copied.captured.text).isEqualTo("val a = 1\nval b = 2")
        assertThat(copiedCalls).isEqualTo(1)
    }

    @Test
    fun `un contenu protege n'offre aucune copie`() {
        sheet(CodeContent.Ready("secret"), exitAllowed = false)
        compose.onNodeWithTag("code-sheet-line-0").assertIsDisplayed()
        compose.onNodeWithTag("Copy code").assertDoesNotExist()
    }
}
