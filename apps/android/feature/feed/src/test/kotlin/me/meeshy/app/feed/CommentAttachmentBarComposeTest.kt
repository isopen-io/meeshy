package me.meeshy.app.feed

import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaUploadItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** #14287 — le ✕ d'une pièce en attente reste dans le coin de sa vignette et la retire. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class CommentAttachmentBarComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val tray = CommentAttachmentTray().adding("p1", MediaUploadItem(byteArrayOf(1, 2), "voice.m4a", "audio/mp4"))
    private val removeLabel get() = RuntimeEnvironment.getApplication().getString(R.string.feed_composer_remove_media)

    @Test
    fun `le ✕ ne déborde pas de la vignette et retire la pièce`() {
        val removed = mutableListOf<String>()
        compose.setContent { CommentAttachmentBar(tray = tray, onEdit = {}, onRemove = { removed += it }) }

        compose.onNodeWithContentDescription(removeLabel)
            .assertWidthIsEqualTo(32.dp)
            .assertHeightIsEqualTo(32.dp)
            .performClick()

        assertThat(removed).containsExactly("p1")
    }
}
