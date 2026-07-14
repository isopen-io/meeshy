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
        text: String = "",
        senderName: String? = null,
        createdAtIso: String? = null,
    ) = BubbleContent(
        messageId = id,
        text = text,
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = senderName,
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = createdAtIso,
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

    @Test
    fun a_messages_text_becomes_its_images_page_caption() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), text = "Sunset over the bay")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly("Sunset over the bay")
    }

    @Test
    fun a_blank_message_text_produces_no_caption() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), text = "")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly(null as String?)
    }

    @Test
    fun a_whitespace_only_message_text_produces_no_caption() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), text = "   \n\t ")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly(null as String?)
    }

    @Test
    fun a_caption_is_trimmed_of_surrounding_whitespace() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), text = "  hello  ")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly("hello")
    }

    @Test
    fun every_image_of_a_multi_image_message_shares_that_messages_caption() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1"), img("a2", "u2"), img("a3", "u3")), text = "Trip")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly("Trip", "Trip", "Trip").inOrder()
    }

    @Test
    fun captions_align_positionally_with_image_urls_across_messages() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"), img("a2", "u2")), text = "first"),
                bubble("m2", listOf(img("a3", "u3")), text = ""),
                bubble("m3", listOf(img("a4", "u4")), text = "third"),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).containsExactly("u1", "u2", "u3", "u4").inOrder()
        assertThat(gallery.captions).containsExactly("first", "first", null, "third").inOrder()
    }

    @Test
    fun a_deleted_message_contributes_no_caption() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1")), text = "kept"),
                bubble("m2", listOf(img("a2", "u2")), isDeleted = true, text = "gone"),
                bubble("m3", listOf(img("a3", "u3")), text = "also kept"),
            ),
            messageId = "m3",
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly("kept", "also kept").inOrder()
    }

    @Test
    fun the_captions_list_is_always_the_same_length_as_the_image_urls() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1"), img("a2", "u2")), text = "a"),
                bubble("m2", listOf(img("a3", "u3"))),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.captions).hasSize(gallery.imageUrls.size)
    }

    @Test
    fun an_empty_gallery_has_no_captions() {
        val gallery = ConversationMediaGallery.of(emptyList(), messageId = "m1", imageIndex = 0)

        assertThat(gallery.captions).isEmpty()
    }

    @Test
    fun a_messages_sender_becomes_its_images_page_author() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), senderName = "Alice")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.senderNames).containsExactly("Alice")
    }

    @Test
    fun a_blank_sender_name_produces_no_author() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), senderName = "")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.senderNames).containsExactly(null as String?)
    }

    @Test
    fun a_whitespace_only_sender_name_produces_no_author() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), senderName = "  \t ")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.senderNames).containsExactly(null as String?)
    }

    @Test
    fun an_author_name_is_trimmed_of_surrounding_whitespace() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), senderName = "  Bob  ")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.senderNames).containsExactly("Bob")
    }

    @Test
    fun every_image_of_a_multi_image_message_shares_that_messages_author() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble(
                    "m1",
                    listOf(img("a1", "u1"), img("a2", "u2"), img("a3", "u3")),
                    senderName = "Carol",
                ),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.senderNames).containsExactly("Carol", "Carol", "Carol").inOrder()
    }

    @Test
    fun a_messages_created_at_becomes_its_images_page_timestamp() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1")), createdAtIso = "2026-07-14T10:00:00Z"),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.createdAtIsos).containsExactly("2026-07-14T10:00:00Z")
    }

    @Test
    fun a_blank_created_at_produces_no_timestamp() {
        val gallery = ConversationMediaGallery.of(
            listOf(bubble("m1", listOf(img("a1", "u1")), createdAtIso = "")),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.createdAtIsos).containsExactly(null as String?)
    }

    @Test
    fun a_created_at_is_trimmed_of_surrounding_whitespace() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble("m1", listOf(img("a1", "u1")), createdAtIso = "  2026-07-14T10:00:00Z  "),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.createdAtIsos).containsExactly("2026-07-14T10:00:00Z")
    }

    @Test
    fun author_and_timestamp_align_positionally_with_image_urls_across_messages() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble(
                    "m1",
                    listOf(img("a1", "u1"), img("a2", "u2")),
                    senderName = "Alice",
                    createdAtIso = "2026-07-14T09:00:00Z",
                ),
                bubble("m2", listOf(img("a3", "u3"))),
                bubble(
                    "m3",
                    listOf(img("a4", "u4")),
                    senderName = "Bob",
                    createdAtIso = "2026-07-14T11:00:00Z",
                ),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).containsExactly("u1", "u2", "u3", "u4").inOrder()
        assertThat(gallery.senderNames).containsExactly("Alice", "Alice", null, "Bob").inOrder()
        assertThat(gallery.createdAtIsos)
            .containsExactly(
                "2026-07-14T09:00:00Z",
                "2026-07-14T09:00:00Z",
                null,
                "2026-07-14T11:00:00Z",
            )
            .inOrder()
    }

    @Test
    fun a_deleted_message_contributes_no_author_or_timestamp() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble(
                    "m1",
                    listOf(img("a1", "u1")),
                    senderName = "Alice",
                    createdAtIso = "2026-07-14T09:00:00Z",
                ),
                bubble(
                    "m2",
                    listOf(img("a2", "u2")),
                    isDeleted = true,
                    senderName = "Ghost",
                    createdAtIso = "2026-07-14T10:00:00Z",
                ),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.senderNames).containsExactly("Alice")
        assertThat(gallery.createdAtIsos).containsExactly("2026-07-14T09:00:00Z")
    }

    @Test
    fun the_author_and_timestamp_lists_are_always_as_long_as_the_image_urls() {
        val gallery = ConversationMediaGallery.of(
            listOf(
                bubble(
                    "m1",
                    listOf(img("a1", "u1"), img("a2", "u2")),
                    senderName = "Alice",
                    createdAtIso = "2026-07-14T09:00:00Z",
                ),
                bubble("m2", listOf(img("a3", "u3"))),
            ),
            messageId = "m1",
            imageIndex = 0,
        )

        assertThat(gallery.senderNames).hasSize(gallery.imageUrls.size)
        assertThat(gallery.createdAtIsos).hasSize(gallery.imageUrls.size)
    }

    @Test
    fun an_empty_gallery_has_no_author_or_timestamp() {
        val gallery = ConversationMediaGallery.of(emptyList(), messageId = "m1", imageIndex = 0)

        assertThat(gallery.senderNames).isEmpty()
        assertThat(gallery.createdAtIsos).isEmpty()
    }
}
