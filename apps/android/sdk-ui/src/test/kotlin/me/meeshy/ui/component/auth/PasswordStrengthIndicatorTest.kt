package me.meeshy.ui.component.auth

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PasswordStrengthLevel
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La jauge de force : six niveaux, cinq segments, un mot par niveau — « Trop faible » à
 * « Excellent » — branchés sur l'évaluateur existant, et annoncés en zone « live ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasswordStrengthIndicatorTest {

    @get:Rule
    val compose = createComposeRule()

    private val segment = SemanticsMatcher("is a strength segment") { node ->
        node.config.getOrNull(SemanticsProperties.TestTag)?.startsWith(PASSWORD_STRENGTH_SEGMENT_TAG_PREFIX) == true
    }

    private val labelByPassword = listOf(
        " " to "Too weak",
        "abcdefg" to "Weak",
        "abcdefgh" to "Medium",
        "Abcdefgh" to "Good",
        "Abcdefg1" to "Strong",
        "Abcdefg1!!" to "Excellent",
    )

    @Test
    fun `each of the six levels is named in words`() {
        val password = mutableStateOf("")
        compose.setContent { MeeshyTheme { PasswordStrengthIndicator(password = password.value) } }

        labelByPassword.forEach { (typed, label) ->
            compose.runOnUiThread { password.value = typed }
            compose.waitForIdle()
            compose.onNodeWithText(label).assertExists()
        }
    }

    @Test
    fun `every level resolves to its own label`() {
        val resources = PasswordStrengthLevel.entries.map(::passwordStrengthLabelRes)

        assertThat(resources.toSet()).hasSize(6)
    }

    @Test
    fun `an empty field says nothing`() {
        val password = mutableStateOf("Abcdefg1")
        compose.setContent { MeeshyTheme { PasswordStrengthIndicator(password = password.value) } }
        compose.onNodeWithText("Strong").assertExists()

        compose.runOnUiThread { password.value = "" }
        compose.waitForIdle()

        compose.onNodeWithText("Strong").assertDoesNotExist()
        compose.onNodeWithText("Too weak").assertDoesNotExist()
    }

    @Test
    fun `five segments are drawn whatever the strength`() {
        compose.setContent { MeeshyTheme { PasswordStrengthIndicator(password = "Abcdefg1!!") } }

        compose.onAllNodes(segment, useUnmergedTree = true).assertCountEquals(5)
    }

    @Test
    fun `the level is announced politely when it changes`() {
        compose.setContent { MeeshyTheme { PasswordStrengthIndicator(password = "abcdefgh") } }

        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite)).assertExists()
    }

    @Test
    fun `the decorative segments are hidden from the screen reader`() {
        compose.setContent { MeeshyTheme { PasswordStrengthIndicator(password = "abcdefgh") } }

        compose.onAllNodes(segment).assertCountEquals(0)
    }
}
