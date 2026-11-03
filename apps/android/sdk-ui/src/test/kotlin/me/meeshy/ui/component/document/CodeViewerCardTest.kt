package me.meeshy.ui.component.document

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
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
class CodeViewerCardTest {

    @get:Rule
    val compose = createComposeRule()

    private fun source(lines: Int) = (1..lines).joinToString("\n") { "val x$it = $it" }

    private fun card(content: CodeContent, onClick: () -> Unit = {}) = compose.setContent {
        CodeViewerCard("Main.kt", CodeLanguage.KOTLIN, "1 KB", content, isDark = true, onClick = onClick)
    }

    @Test
    fun `la carte montre dix lignes numerotees et le reste en une ligne`() {
        card(CodeContent.Ready(source(25)))
        compose.onNodeWithTag("code-card-line-9", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("code-card-line-10", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("15 more lines").assertIsDisplayed()
    }

    @Test
    fun `un fichier de dix lignes ou moins n'annonce rien de plus`() {
        card(CodeContent.Ready(source(10)))
        compose.onNodeWithTag("code-card-line-9", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("code-card-more", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `l'en-tete porte le nom, le langage et la taille`() {
        card(CodeContent.Ready("a"))
        compose.onNodeWithText("Main.kt").assertIsDisplayed()
        compose.onNodeWithText("Kotlin").assertIsDisplayed()
        compose.onNodeWithText("1 KB").assertIsDisplayed()
    }

    @Test
    fun `un toucher ouvre la fiche`() {
        var opened = 0
        card(CodeContent.Ready("a")) { opened++ }
        compose.onNodeWithText("Main.kt").performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `chargement et echec ont leur libelle`() {
        compose.setContent {
            CodeViewerCard("", CodeLanguage.PYTHON, null, CodeContent.Failed, isDark = false, onClick = {})
        }
        compose.onNodeWithText("Unable to load file").assertIsDisplayed()
        compose.onAllNodesWithText("Python")[0].assertIsDisplayed()
    }

    @Test
    fun `comptage des lignes comme iOS et tete du source`() {
        assertThat(codeLineCount("a\nb\n")).isEqualTo(3)
        assertThat(codeHead("a\nb\nc", 2)).isEqualTo("a\nb")
        assertThat(codeHead("a\nb", 5)).isEqualTo("a\nb")
    }
}
