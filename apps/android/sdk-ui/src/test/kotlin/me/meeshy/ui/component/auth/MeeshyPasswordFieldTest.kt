@file:OptIn(ExperimentalComposeUiApi::class)

package me.meeshy.ui.component.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.autofill.AutofillTree
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.platform.LocalAutofillTree
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le champ de mot de passe : masqué par défaut, un œil qui bascule en annonçant l'ACTION dans
 * son libellé et l'ÉTAT dans sa description d'état (« Masqué » / « Affiché »), une cible de
 * 48 dp, et rien de conservé dans l'état sauvegardé.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyPasswordFieldTest {

    @get:Rule
    val compose = createComposeRule()

    private val isMasked = SemanticsMatcher.keyIsDefined(SemanticsProperties.Password)

    private fun field() = compose.onNode(hasSetTextAction())

    @Composable
    private fun Host(role: MeeshyPasswordRole = MeeshyPasswordRole.Current, autofillTree: AutofillTree? = null) {
        CompositionLocalProvider(LocalAutofillTree provides (autofillTree ?: LocalAutofillTree.current)) {
            MeeshyTheme {
                var text by remember { mutableStateOf("") }
                MeeshyPasswordField(value = text, onValueChange = { text = it }, placeholder = "Password", role = role)
            }
        }
    }

    @Test
    fun `the password is masked by default and says so to the screen reader`() {
        compose.setContent { Host() }

        field().assert(isMasked)
        compose.onNodeWithContentDescription("Show password").assertExists()
        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Hidden")).assertExists()
    }

    @Test
    fun `the eye reveals the password and announces the shown state`() {
        compose.setContent { Host() }

        compose.onNodeWithContentDescription("Show password").performClick()

        field().assert(!isMasked)
        compose.onNodeWithContentDescription("Hide password").assertExists()
        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Shown")).assertExists()
    }

    @Test
    fun `the eye masks it again on a second tap`() {
        compose.setContent { Host() }

        compose.onNodeWithContentDescription("Show password").performClick()
        compose.onNodeWithContentDescription("Hide password").performClick()

        field().assert(isMasked)
        compose.onNodeWithContentDescription("Show password").assertExists()
    }

    @Test
    fun `toggling the eye keeps what was typed`() {
        compose.setContent { Host() }
        field().performTextInput("s3cret")

        compose.onNodeWithContentDescription("Show password").performClick()

        val typed = field().fetchSemanticsNode().config[SemanticsProperties.EditableText].text
        assertThat(typed).isEqualTo("s3cret")
    }

    @Test
    fun `the eye is a 48 dp target`() {
        compose.setContent { Host() }

        compose.onNodeWithContentDescription("Show password")
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `a restored screen remasks the password instead of resurrecting the reveal`() {
        val restoration = StateRestorationTester(compose)
        restoration.setContent { Host() }
        compose.onNodeWithContentDescription("Show password").performClick()
        field().assert(!isMasked)

        restoration.emulateSavedInstanceStateRestore()

        field().assert(isMasked)
        compose.onNodeWithContentDescription("Show password").assertExists()
    }

    @Test
    fun `the existing password asks the manager to fill it in`() {
        val tree = AutofillTree()
        compose.setContent { Host(role = MeeshyPasswordRole.Current, autofillTree = tree) }

        assertThat(tree.children.values.flatMap { it.autofillTypes }).containsExactly(AutofillType.Password)
    }

    @Test
    fun `a password being chosen asks the manager to propose a strong one`() {
        val tree = AutofillTree()
        compose.setContent { Host(role = MeeshyPasswordRole.New, autofillTree = tree) }

        assertThat(tree.children.values.flatMap { it.autofillTypes }).containsExactly(AutofillType.NewPassword)
    }
}
