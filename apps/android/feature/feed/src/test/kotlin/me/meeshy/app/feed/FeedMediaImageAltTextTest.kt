package me.meeshy.app.feed

import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Behavioural spec for the accessibility consumer half of #6739: a TalkBack
 * user must hear the author's own description of a post image, never a
 * generic "Post image" fallback that silently discards it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedMediaImageAltTextTest {

    @get:Rule
    val compose = createComposeRule()

    private fun image(alt: String? = null) = FeedPostImage(
        id = "m1",
        url = "https://cdn.example/m1.jpg",
        thumbnailUrl = null,
        width = null,
        height = null,
        thumbHash = null,
        alt = alt,
    )

    private fun show(alt: String?) {
        compose.setContent {
            MeeshyTheme { FeedMediaImage(image = image(alt = alt), preferThumbnail = false) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `an author-authored description becomes the rendered contentDescription`() {
        show(alt = "A red bicycle leaning on a brick wall")

        compose.onNodeWithContentDescription("A red bicycle leaning on a brick wall").assertExists()
    }

    @Test
    fun `a blank alt falls back to the generic localized label, never an empty announcement`() {
        show(alt = "   ")

        compose.onNodeWithContentDescription("Post image").assertExists()
    }

    @Test
    fun `no alt at all falls back to the generic localized label`() {
        show(alt = null)

        compose.onNodeWithContentDescription("Post image").assertExists()
    }
}
