package me.meeshy.ui.sticker

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en")
class StickerTemplateArtworkRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `un cadre a mots dessine les mots de l'auteur`() {
        compose.setContent { MeeshyTheme { StickerTemplateArtwork("text.neon", mapOf("text" to "Salut"), body = 24.dp) } }
        compose.onNodeWithText("Salut").assertIsDisplayed()
    }

    @Test
    fun `un cadre vide dessine l'exemple, dans la langue du lecteur`() {
        compose.setContent { MeeshyTheme { StickerTemplateArtwork("text.speechBubble", emptyMap(), body = 24.dp) } }
        compose.onNodeWithText("Hey there!").assertIsDisplayed()
    }

    @Test
    fun `l'heure figee se lit telle que l'auteur l'a posee`() {
        compose.setContent {
            MeeshyTheme { StickerTemplateArtwork("time.digital", mapOf("time" to "14:07", "hour" to "14", "minute" to "07"), body = 24.dp) }
        }
        compose.onNodeWithText("14:07").assertIsDisplayed()
    }

    @Test
    fun `le cadran dit l'heure a TalkBack`() {
        compose.setContent {
            MeeshyTheme { StickerTemplateArtwork("time.analog", mapOf("time" to "14:07", "hour" to "14", "minute" to "07"), body = 24.dp) }
        }
        compose.onNodeWithContentDescription("Clock face, 14:07").assertIsDisplayed()
    }

    @Test
    fun `seuls les gabarits du catalogue se dessinent`() {
        assertThat(StickerTemplateArtwork.knows("text.tape")).isTrue()
        assertThat(StickerTemplateArtwork.knows("weather.sun")).isFalse()
    }
}
