package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleImage
import org.junit.Test

class ConversationMediaGalleryTest {

    private fun img(id: String, url: String) = BubbleImage(attachmentId = id, url = url)

    private fun bubble(
        id: String,
        images: List<BubbleImage> = emptyList(),
        isDeleted: Boolean = false,
    ) = BubbleContent(
        messageId = id,
        text = "",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = null,
        images = images,
    )

    @Test
    fun no_messages_produce_an_empty_gallery() {
        val gallery = ConversationMediaGallery.of(emptyList(), messageId = "m1", imageIndex = 0)

        assertThat(gallery.isEmpty).isTrue()
        assertThat(gallery.imageUrls).isEmpty()
        assertThat(gallery.startIndex).isEqualTo(0)
    }

    @Test
    fun messages_with_no_images_produce_an_empty_gallery() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1"), bubble("m2")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.isEmpty).isTrue()
    }

    @Test
    fun a_single_image_opens_at_index_zero() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")))),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).containsExactly("u1")
        assertThat(gallery.startIndex).isEqualTo(0)
    }

    @Test
    fun tapping_a_later_image_within_one_message_starts_there() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1"), img("a2", "u2"), img("a3", "u3")))),
            messageId = "m1",
            imageIndex = 1,
        )

        assertThat(gallery.imageUrls).containsExactly("u1", "u2", "u3").inOrder()
        assertThat(gallery.startIndex).isEqualTo(1)
    }

    @Test
    fun the_gallery_spans_every_message_in_conversation_order() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"), img("a2", "u2"))),
                bubble("m2", listOf(img("a3", "u3"))),
                bubble("m3", listOf(img("a4", "u4"), img("a5", "u5"))),
            ),
            messageId = "m3",
            imageIndex = 1,
        )

        assertThat(gallery.imageUrls).containsExactly("u1", "u2", "u3", "u4", "u5").inOrder()
        // 2 (m1) + 1 (m2) + 1 (index within m3) = 4
        assertThat(gallery.startIndex).isEqualTo(4)
    }

    @Test
    fun messages_without_images_are_skipped_without_shifting_the_start() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"))),
                bubble("m2"),
                bubble("m3", listOf(img("a2", "u2"))),
            ),
            messageId = "m3",
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).containsExactly("u1", "u2").inOrder()
        assertThat(gallery.startIndex).isEqualTo(1)
    }

    @Test
    fun an_out_of_range_image_index_clamps_to_the_last_image_of_the_message() {
        // A trailing message adds images AFTER m1, so a naive `size + imageIndex`
        // would overshoot into m2's range instead of staying inside m1.
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"), img("a2", "u2"))),
                bubble("m2", listOf(img("a3", "u3"), img("a4", "u4"))),
            ),
            messageId = "m1",
            imageIndex = 9,
        )

        assertThat(gallery.startIndex).isEqualTo(1)
    }

    @Test
    fun a_negative_image_index_clamps_to_the_first_image_of_the_message() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"))),
                bubble("m2", listOf(img("a2", "u2"), img("a3", "u3"))),
            ),
            messageId = "m2",
            imageIndex = -3,
        )

        // m2's first image is flat index 1
        assertThat(gallery.startIndex).isEqualTo(1)
    }

    @Test
    fun an_unknown_message_id_still_shows_the_whole_conversation_from_the_start() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"))),
                bubble("m2", listOf(img("a2", "u2"))),
            ),
            messageId = "does-not-exist",
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).containsExactly("u1", "u2").inOrder()
        assertThat(gallery.startIndex).isEqualTo(0)
    }

    @Test
    fun a_deleted_message_contributes_no_images_to_the_gallery() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"))),
                bubble("m2", listOf(img("a2", "u2")), isDeleted = true),
                bubble("m3", listOf(img("a3", "u3"))),
            ),
            messageId = "m3",
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).containsExactly("u1", "u3").inOrder()
        assertThat(gallery.startIndex).isEqualTo(1)
    }

    @Test
    fun tapping_a_deleted_message_falls_back_to_the_start() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"))),
                bubble("m2", listOf(img("a2", "u2")), isDeleted = true),
            ),
            messageId = "m2",
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).containsExactly("u1")
        assertThat(gallery.startIndex).isEqualTo(0)
    }

    @Test
    fun a_matched_message_with_no_images_falls_back_to_the_start() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"))),
                bubble("m2"),
                bubble("m3", listOf(img("a2", "u2"))),
            ),
            messageId = "m2",
            imageIndex = 0,
        )

        assertThat(gallery.startIndex).isEqualTo(0)
        assertThat(gallery.imageUrls).containsExactly("u1", "u2").inOrder()
    }
}
