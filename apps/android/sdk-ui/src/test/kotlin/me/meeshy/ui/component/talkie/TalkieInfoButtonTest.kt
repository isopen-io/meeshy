package me.meeshy.ui.component.talkie

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le (i) du talkie (#18099, épure #17584) : son nom accessible est la QUESTION à laquelle la note répond, la note se
 * déplie SOUS la rangée comme les autres (i) et reste lue par TalkBack, et elle ne répète pas la phrase déjà visible
 * au repos sur la fiche (« Maintenez et parlez : votre voix joue directement chez … »).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TalkieInfoButtonTest {

    @get:Rule
    val compose = createComposeRule()

    private val question = "When to use the walkie-talkie?"
    private val note = "Only for your very closest people, in an extreme emergency."

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                var open by remember { mutableStateOf(false) }
                Column {
                    TalkieInfoButton(expanded = open, onToggle = { open = !open })
                    if (open) TalkieInfoNote()
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `le i se nomme par la question, pas par un intitule de sujet, avec une cible de 48 dp`() {
        show()
        compose.onNodeWithContentDescription(question)
            .assertIsDisplayed()
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
        compose.onNodeWithContentDescription("About the emergency walkie-talkie").assertDoesNotExist()
    }

    @Test
    fun `la note replie est lue par le lecteur d ecran sans etre affichee`() {
        show()
        compose.onNodeWithText(note).assertDoesNotExist()
        val described = compose.onNodeWithTag(TALKIE_INFO_TAG).fetchSemanticsNode().config[SemanticsProperties.StateDescription]
        assertThat(described).isEqualTo(note)
    }

    @Test
    fun `toucher le i deplie la note sous la rangee, la retoucher la referme`() {
        show()
        compose.onNodeWithTag(TALKIE_INFO_TAG).performClick()
        compose.onNodeWithText(note).assertIsDisplayed()
        compose.onNodeWithTag(TALKIE_INFO_TAG).performClick()
        compose.onNodeWithText(note).assertDoesNotExist()
    }

    @Test
    fun `la note ne repete plus que la voix joue chez eux, deja dit au repos`() {
        show()
        compose.onNodeWithTag(TALKIE_INFO_TAG).performClick()
        compose.onNodeWithText("Available for your very closest people. Use it only in an extreme emergency: your voice plays on their phone even when Meeshy is in the background.")
            .assertDoesNotExist()
    }
}
