@file:OptIn(ExperimentalComposeUiApi::class)

package me.meeshy.ui.component.auth

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
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
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.text.input.KeyboardType
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.AuthFieldBorder
import me.meeshy.sdk.model.auth.AuthFieldBorderRole
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le champ de saisie des écrans d'accès : le liseré change avec le focus et l'erreur, le
 * contenu attendu est déclaré à l'autofill du système, l'erreur se lit sous le champ.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AuthTextFieldTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(
        contentType: AuthContentType = AuthContentType.None,
        isSecure: Boolean = false,
        errorText: String? = null,
        autofillTree: AutofillTree = AutofillTree(),
    ) {
        compose.setContent {
            CompositionLocalProvider(LocalAutofillTree provides autofillTree) {
                MeeshyTheme {
                    var text by remember { mutableStateOf("") }
                    AuthTextField(
                        value = text,
                        onValueChange = { text = it },
                        title = "Username",
                        icon = Icons.Filled.Person,
                        isSecure = isSecure,
                        contentType = contentType,
                        errorText = errorText,
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun border(): AuthFieldBorder = compose
        .onNode(SemanticsMatcher.keyIsDefined(AuthFieldBorderKey))
        .fetchSemanticsNode()
        .config[AuthFieldBorderKey]

    @Test
    fun `an idle field wears the soft input border`() {
        show()

        assertThat(border().role).isEqualTo(AuthFieldBorderRole.INPUT)
    }

    @Test
    fun `focus turns the border to the brand indigo`() {
        show()

        compose.onNode(hasSetTextAction()).performClick()
        compose.waitForIdle()

        assertThat(border().role).isEqualTo(AuthFieldBorderRole.BRAND)
        assertThat(border().alpha).isEqualTo(AuthFieldBorder.FOCUSED_ALPHA)
    }

    @Test
    fun `a validation error reddens the border and is written under the field`() {
        show(errorText = "Too short")

        assertThat(border().role).isEqualTo(AuthFieldBorderRole.ERROR)
        compose.onNodeWithText("Too short").assertExists()
    }

    @Test
    fun `what is typed reaches the host`() {
        show()

        compose.onNode(hasSetTextAction()).performTextInput("ada")

        val typed = compose.onNode(hasSetTextAction()).fetchSemanticsNode().config[SemanticsProperties.EditableText].text
        assertThat(typed).isEqualTo("ada")
    }

    @Test
    fun `the placeholder shows while empty and gives way to the text`() {
        show()
        compose.onNodeWithText("Username").assertExists()

        compose.onNode(hasSetTextAction()).performTextInput("ada")

        compose.onNodeWithText("Username").assertDoesNotExist()
    }

    @Test
    fun `a username field declares itself as a username to the autofill`() {
        val tree = AutofillTree()
        show(contentType = AuthContentType.Username, autofillTree = tree)

        assertThat(tree.children.values.flatMap { it.autofillTypes }).containsExactly(AutofillType.Username)
    }

    @Test
    fun `an email field declares itself as an email address to the autofill`() {
        val tree = AutofillTree()
        show(contentType = AuthContentType.Email, autofillTree = tree)

        assertThat(tree.children.values.flatMap { it.autofillTypes }).containsExactly(AutofillType.EmailAddress)
    }

    @Test
    fun `a code field declares itself as a one-time code to the autofill`() {
        val tree = AutofillTree()
        show(contentType = AuthContentType.OneTimeCode, autofillTree = tree)

        assertThat(tree.children.values.flatMap { it.autofillTypes }).containsExactly(AutofillType.SmsOtpCode)
    }

    @Test
    fun `a field with no declared content asks the autofill for nothing`() {
        val tree = AutofillTree()
        show(contentType = AuthContentType.None, autofillTree = tree)

        assertThat(tree.children).isEmpty()
    }

    @Test
    fun `a secure field wraps the password field and declares the existing password`() {
        val tree = AutofillTree()
        show(contentType = AuthContentType.Password, isSecure = true, autofillTree = tree)

        assertThat(tree.children.values.flatMap { it.autofillTypes }).containsExactly(AutofillType.Password)
        compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.Password)).assertExists()
    }

    @Test
    fun `a secure field defining a password declares a new one`() {
        val tree = AutofillTree()
        show(contentType = AuthContentType.NewPassword, isSecure = true, autofillTree = tree)

        assertThat(tree.children.values.flatMap { it.autofillTypes }).containsExactly(AutofillType.NewPassword)
    }

    @Test
    fun `each content type picks the keyboard that suits it`() {
        assertThat(AuthContentType.Email.keyboardType).isEqualTo(KeyboardType.Email)
        assertThat(AuthContentType.OneTimeCode.keyboardType).isEqualTo(KeyboardType.Number)
        assertThat(AuthContentType.Password.keyboardType).isEqualTo(KeyboardType.Password)
        assertThat(AuthContentType.NewPassword.keyboardType).isEqualTo(KeyboardType.Password)
        assertThat(AuthContentType.Username.keyboardType).isEqualTo(KeyboardType.Text)
    }
}
