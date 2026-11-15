package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the accessibility consumer half of #6813: a TalkBack
 * user must hear the author's own description of a conversation image, never
 * a generic fallback that silently discards it.
 */
class BubbleImageContentDescriptionTest {

    private fun image(alt: String? = null) =
        BubbleImage(attachmentId = "a1", url = "https://cdn.example/a1.jpg", alt = alt)

    @Test
    fun `an author-authored description is used as the content description`() {
        val description = bubbleImageContentDescription(
            image(alt = "A red bicycle leaning on a brick wall"),
            fallback = "Image",
        )

        assertThat(description).isEqualTo("A red bicycle leaning on a brick wall")
    }

    @Test
    fun `a blank alt falls back to the generic label, never a blank announcement`() {
        val description = bubbleImageContentDescription(image(alt = "   "), fallback = "Image")

        assertThat(description).isEqualTo("Image")
    }

    @Test
    fun `no alt at all falls back to the generic label`() {
        val description = bubbleImageContentDescription(image(alt = null), fallback = "Image")

        assertThat(description).isEqualTo("Image")
    }
}
