package me.meeshy.app.stories

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le pied de scène des références (#13846) : hashtags et « Avec … », jamais une mention silencieuse, absent s'il est vide. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerSceneReferenceFooterTest {

    @get:Rule
    val compose = createComposeRule()

    private val note = PostMentionInput(userId = "1", username = "ana", display = "NOTE")
    private val silent = PostMentionInput(userId = "2", username = "bob", display = "SILENT")
    private val pinned = PostMentionInput(userId = "3", username = "cleo", display = "PINNED")

    @Test
    fun `the footer names referenced mentions and hashtags, and each half reopens its sheet`() {
        var hashtagsOpened = 0
        var mentionsOpened = 0
        compose.setContent {
            MeeshyTheme {
                ComposerSceneReferenceFooter(
                    hashtags = listOf("voyage", "mer"),
                    mentions = listOf(note, silent, pinned),
                    onHashtags = { hashtagsOpened++ },
                    onMentions = { mentionsOpened++ },
                )
            }
        }
        compose.onNodeWithText("With @ana").performClick()
        compose.onNodeWithContentDescription("Hashtags : voyage, mer").performClick()
        compose.onAllNodesWithText("bob", substring = true).assertCountEquals(0)
        compose.onAllNodesWithText("cleo", substring = true).assertCountEquals(0)
        assertThat(mentionsOpened).isEqualTo(1)
        assertThat(hashtagsOpened).isEqualTo(1)
    }

    @Test
    fun `a silent mention alone leaves no footer`() {
        compose.setContent {
            MeeshyTheme {
                ComposerSceneReferenceFooter(hashtags = emptyList(), mentions = listOf(silent), onHashtags = {}, onMentions = {})
            }
        }
        compose.onAllNodesWithText("@", substring = true).assertCountEquals(0)
        compose.onAllNodesWithText("With", substring = true).assertCountEquals(0)
    }
}
