package me.meeshy.app.chat

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le popup de l'envoi d'un vocal sans consentement : Activer, Plus tard, Configurer (#16420, iOS `ConversationVoiceConsentAlert`). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatVoiceConsentDialogTest {

    @get:Rule
    val compose = createComposeRule()

    private val taps = mutableListOf<String>()

    private fun show() = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            ChatVoiceConsentDialog(
                onAccept = { taps += "accept" },
                onLater = { taps += "later" },
                onConfigure = { taps += "configure" },
                onDismiss = { taps += "dismiss" },
            )
        }
    }

    @Test
    fun `le popup dit ce qu'il propose`() {
        show()

        compose.onNodeWithText("Automatic voice message translation").assertExists()
    }

    @Test
    fun `activer accorde le consentement`() {
        show()
        compose.onNodeWithText("Enable").performClick()
        assertThat(taps).containsExactly("accept")
    }

    @Test
    fun `plus tard envoie tel quel`() {
        show()
        compose.onNodeWithText("Later").performClick()
        assertThat(taps).containsExactly("later")
    }

    @Test
    fun `configurer ouvre la configuration de la voix`() {
        show()
        compose.onNodeWithText("Configure").performClick()
        assertThat(taps).containsExactly("configure")
    }
}
