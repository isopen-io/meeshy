package me.meeshy.ui.component.comments

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.CommentQuotedMedia
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CommentQuotedMediaViewsTest {

    @get:Rule
    val compose = createComposeRule()

    private val accent = Color(0xFF123456)

    private fun citation(caption: String?, withMedia: Boolean = true, kind: CommentQuotedMedia.Kind = CommentQuotedMedia.Kind.IMAGE) =
        CommentQuotedMedia("pm", kind, if (withMedia) ApiPostMedia(id = "pm", fileUrl = "https://f/a.jpg", caption = caption) else null)

    @Test
    fun `le bandeau dit la legende du media quand elle existe`() {
        compose.setContent { MeeshyTheme { CommentQuotedMediaBanner(citation("Plage de nuit"), accent) } }
        compose.onNodeWithText("Plage de nuit").assertIsDisplayed()
    }

    @Test
    fun `un media disparu degrade la citation vers sa nature seule sans l effacer`() {
        compose.setContent { MeeshyTheme { CommentQuotedMediaBanner(citation(null, withMedia = false, kind = CommentQuotedMedia.Kind.VIDEO), accent) } }
        compose.onNodeWithText("A video").assertIsDisplayed()
    }

    @Test
    fun `la puce dit a propos de, la legende, et sa croix retire la citation`() {
        var removed = 0
        compose.setContent { MeeshyTheme { CommentQuotationChip(citation(null, withMedia = false), accent, onRemove = { removed++ }) } }
        compose.onNodeWithText("About").assertIsDisplayed()
        compose.onNodeWithText("A photo").assertIsDisplayed()
        compose.onNodeWithContentDescription("Remove quote").performClick()
        assertThat(removed).isEqualTo(1)
    }

    @Test
    fun `sans citation la puce n affiche rien`() {
        compose.setContent { MeeshyTheme { CommentQuotationChip(null, accent, onRemove = {}) } }
        compose.onNodeWithText("About").assertDoesNotExist()
    }
}
