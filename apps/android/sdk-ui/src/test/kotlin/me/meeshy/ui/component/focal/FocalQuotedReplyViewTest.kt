package me.meeshy.ui.component.focal

import androidx.compose.ui.graphics.Color
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalQuotedReplyViewTest {

    @get:Rule
    val compose = createComposeRule()

    private fun reply(
        name: String? = "Alice",
        isMe: Boolean = false,
        text: String = "On se retrouve à 18h ?",
        media: String? = null,
    ) = FocalQuotedReply(
        authorName = name,
        isMe = isMe,
        isMood = false,
        previewText = text,
        mediaLabel = media,
        thumbnailUrl = null,
    )

    private fun show(
        reply: FocalQuotedReply,
        onJump: (() -> Unit)? = null,
        onAuthorTap: (() -> Unit)? = null,
    ) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                FocalQuotedReplyView(
                    reply = reply,
                    accentColor = Color.Blue,
                    onJump = onJump,
                    onAuthorTap = onAuthorTap,
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `la citation nomme l'auteur et cite son texte`() {
        show(reply())

        compose.onNodeWithText("Alice :").assertExists()
        compose.onNodeWithText("On se retrouve à 18h ?").assertExists()
    }

    @Test
    fun `ma propre citation se nomme Vous`() {
        show(reply(isMe = true))

        compose.onNodeWithText("You :").assertExists()
    }

    @Test
    fun `un apercu vide retombe sur le libelle du media puis sur Media`() {
        show(reply(text = "", media = "Photo"))
        compose.onNodeWithText("Photo").assertExists()
    }

    @Test
    fun `un apercu et un libelle vides se lisent Media`() {
        show(reply(text = "", media = null))
        compose.onNodeWithText("Media").assertExists()
    }

    @Test
    fun `toucher le texte cite saute a l'original`() {
        var jumped = 0
        show(reply(), onJump = { jumped++ })

        compose.onNodeWithText("On se retrouve à 18h ?", useUnmergedTree = true).performClick()

        assertThat(jumped).isEqualTo(1)
    }

    @Test
    fun `toucher le nom ouvre le profil sans sauter`() {
        var jumped = 0
        var profile = 0
        show(reply(), onJump = { jumped++ }, onAuthorTap = { profile++ })

        compose.onNodeWithText("Alice :").performClick()

        assertThat(profile).isEqualTo(1)
        assertThat(jumped).isEqualTo(0)
    }
}
