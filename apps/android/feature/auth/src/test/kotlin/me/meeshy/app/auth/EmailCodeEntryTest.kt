package me.meeshy.app.auth

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.hasSetTextAction
import me.meeshy.sdk.model.auth.EmailProofError
import me.meeshy.sdk.model.auth.OtpVerificationGate
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EmailCodeEntryTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(
        code: String = "",
        gate: OtpVerificationGate = OtpVerificationGate(),
        error: EmailProofError? = null,
        provenElsewhere: Boolean = false,
        onCodeChange: (String) -> Unit = {},
        onVerify: () -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme {
                EmailCodeEntry(
                    code = code,
                    gate = gate,
                    error = error,
                    provenElsewhere = provenElsewhere,
                    onCodeChange = onCodeChange,
                    onVerify = onVerify,
                )
            }
        }
    }

    @Test
    fun `le bouton verifier reste desactive sous six chiffres`() {
        show(code = "12345")
        compose.onNodeWithText("Verify").assertIsNotEnabled()
    }

    @Test
    fun `le bouton verifier est actif a six chiffres et lance la verification`() {
        var verified = 0
        show(code = "123456", onVerify = { verified++ })
        compose.onNodeWithText("Verify").assertIsEnabled().performClick()
        assertEquals(1, verified)
    }

    @Test
    fun `la saisie ne remonte que des chiffres, six au plus`() {
        val received = mutableListOf<String>()
        show(onCodeChange = { received += it })
        compose.onNode(hasSetTextAction()).performTextInput("12a3-45678")
        assertEquals("123456", received.last())
    }

    @Test
    fun `l'erreur typee est dite sous le champ`() {
        show(code = "123456", error = EmailProofError.EXPIRED_CODE)
        compose.onNodeWithText("This code has expired. Request a new one.").assertExists()
    }

    @Test
    fun `la preuve faite ailleurs affiche le bandeau Adresse confirmee`() {
        show(provenElsewhere = true)
        compose.onNodeWithText("Address confirmed", substring = true).assertExists()
    }
}
