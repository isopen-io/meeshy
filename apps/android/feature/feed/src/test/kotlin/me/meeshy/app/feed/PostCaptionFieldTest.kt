package me.meeshy.app.feed

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The caption field of the plateau and of the modal sheet: one field, writing the caption of ITS media (not the alt, not the content). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostCaptionFieldTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `typing writes the caption of the media the field is keyed on`() {
        val written = mutableListOf<Pair<String, String>>()
        compose.setContent { MeeshyTheme { PostCaptionField(mediaId = "m1", value = "", onChange = { id, text -> written += id to text }) } }
        compose.onNodeWithText("Add a caption").performTextInput("Au marché")
        assertThat(written.last()).isEqualTo("m1" to "Au marché")
    }

    @Test
    fun `switching slides shows the caption of the media now current`() {
        var media by mutableStateOf("a")
        val captions = mapOf("a" to "légende A", "b" to "légende B")
        compose.setContent { MeeshyTheme { PostCaptionField(mediaId = media, value = captions.getValue(media), onChange = { _, _ -> }) } }
        compose.onNodeWithText("légende A").assertExists()
        media = "b"
        compose.waitForIdle()
        compose.onNodeWithText("légende B").assertExists()
    }
}
