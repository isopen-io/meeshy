package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import org.junit.Test

/**
 * Pure state machine behind the scroll-to-bottom control. It answers two product
 * questions the raw list position cannot: *is the control shown* and *how many
 * unread messages arrived while the reader was scrolled away* (plus a preview of
 * the newest one). Port of the iOS `ConversationScrollControlsView` book-keeping
 * (`pendingUnreadCount` grows on bottom-deltas while scrolled away; scroll-to-bottom
 * resets the badge + preview). Behaviour is asserted through [ScrollAffordance.next].
 */
class ScrollAffordanceTest {

    private fun msg(
        id: String,
        outgoing: Boolean = false,
        deleted: Boolean = false,
        sender: String? = "Bob",
        text: String = "hello $id",
        kind: UnreadPreviewKind = UnreadPreviewKind.Text,
    ) = AffordanceMessage(
        id = id,
        isOutgoing = outgoing,
        isDeleted = deleted,
        senderName = sender,
        text = text,
        kind = kind,
    )

    // ---- caught up (near bottom) -------------------------------------------

    @Test
    fun near_bottom_hides_the_control_and_acknowledges_the_newest() {
        val next = ScrollAffordance.next(
            previous = ScrollAffordanceState(),
            messages = listOf(msg("m1"), msg("m2"), msg("m3")),
            isNearBottom = true,
        )

        assertThat(next.isVisible).isFalse()
        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.preview).isNull()
        assertThat(next.lastAcknowledgedId).isEqualTo("m3")
    }

    @Test
    fun near_bottom_with_no_messages_acknowledges_nothing() {
        val next = ScrollAffordance.next(
            previous = ScrollAffordanceState(),
            messages = emptyList(),
            isNearBottom = true,
        )

        assertThat(next.isVisible).isFalse()
        assertThat(next.lastAcknowledgedId).isNull()
        assertThat(next.unreadCount).isEqualTo(0)
    }

    @Test
    fun returning_to_the_bottom_clears_a_pending_badge() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1"), msg("m2")),
            isNearBottom = true,
        )
        val scrolledAwayWithUnread = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m1"), msg("m2"), msg("m3")),
            isNearBottom = false,
        )
        assertThat(scrolledAwayWithUnread.unreadCount).isEqualTo(1)

        val backAtBottom = ScrollAffordance.next(
            scrolledAwayWithUnread,
            listOf(msg("m1"), msg("m2"), msg("m3")),
            isNearBottom = true,
        )

        assertThat(backAtBottom.isVisible).isFalse()
        assertThat(backAtBottom.unreadCount).isEqualTo(0)
        assertThat(backAtBottom.preview).isNull()
        assertThat(backAtBottom.lastAcknowledgedId).isEqualTo("m3")
    }

    // ---- scrolled away, no new content -------------------------------------

    @Test
    fun scrolled_away_with_no_new_messages_shows_the_control_without_a_badge() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1"), msg("m2")),
            isNearBottom = true,
        )

        val next = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m1"), msg("m2")),
            isNearBottom = false,
        )

        assertThat(next.isVisible).isTrue()
        assertThat(next.hasUnread).isFalse()
        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.preview).isNull()
    }

    // ---- scrolled away, new content ----------------------------------------

    @Test
    fun one_incoming_message_while_scrolled_away_counts_and_previews() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1")),
            isNearBottom = true,
        )

        val next = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m1"), msg("m2", sender = "Alice", text = "ping")),
            isNearBottom = false,
        )

        assertThat(next.isVisible).isTrue()
        assertThat(next.unreadCount).isEqualTo(1)
        assertThat(next.preview?.messageId).isEqualTo("m2")
        assertThat(next.preview?.senderName).isEqualTo("Alice")
        assertThat(next.preview?.text).isEqualTo("ping")
    }

    @Test
    fun several_incoming_messages_accumulate_and_preview_the_newest() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1")),
            isNearBottom = true,
        )

        val next = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m1"), msg("m2"), msg("m3"), msg("m4", text = "newest")),
            isNearBottom = false,
        )

        assertThat(next.unreadCount).isEqualTo(3)
        assertThat(next.preview?.messageId).isEqualTo("m4")
        assertThat(next.preview?.text).isEqualTo("newest")
    }

    @Test
    fun the_reader_own_messages_do_not_count_as_unread() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1")),
            isNearBottom = true,
        )

        val next = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m1"), msg("m2", outgoing = true), msg("m3", outgoing = true)),
            isNearBottom = false,
        )

        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.preview).isNull()
    }

    @Test
    fun deleted_incoming_messages_do_not_count_as_unread() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1")),
            isNearBottom = true,
        )

        val next = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m1"), msg("m2", deleted = true)),
            isNearBottom = false,
        )

        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.preview).isNull()
    }

    @Test
    fun a_mix_counts_only_incoming_undeleted_and_previews_the_newest_such() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1")),
            isNearBottom = true,
        )

        val next = ScrollAffordance.next(
            acknowledged,
            listOf(
                msg("m1"),
                msg("m2", text = "real one"),
                msg("m3", outgoing = true),
                msg("m4", deleted = true),
            ),
            isNearBottom = false,
        )

        assertThat(next.unreadCount).isEqualTo(1)
        assertThat(next.preview?.messageId).isEqualTo("m2")
        assertThat(next.preview?.text).isEqualTo("real one")
    }

    @Test
    fun preview_carries_the_message_kind() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1")),
            isNearBottom = true,
        )

        val next = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m1"), msg("m2", kind = UnreadPreviewKind.Image)),
            isNearBottom = false,
        )

        assertThat(next.preview?.kind).isEqualTo(UnreadPreviewKind.Image)
    }

    // ---- lost-anchor / cold-start baselines --------------------------------

    @Test
    fun a_fresh_state_opened_scrolled_away_baselines_without_a_phantom_badge() {
        val next = ScrollAffordance.next(
            previous = ScrollAffordanceState(),
            messages = listOf(msg("m1"), msg("m2"), msg("m3")),
            isNearBottom = false,
        )

        assertThat(next.isVisible).isTrue()
        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.preview).isNull()
        assertThat(next.lastAcknowledgedId).isEqualTo("m3")
    }

    @Test
    fun a_pruned_anchor_rebaselines_to_the_newest_instead_of_counting_all_history() {
        val staleAnchor = ScrollAffordanceState(
            isAtBottom = false,
            unreadCount = 2,
            lastAcknowledgedId = "gone",
        )

        val next = ScrollAffordance.next(
            previous = staleAnchor,
            messages = listOf(msg("m8"), msg("m9")),
            isNearBottom = false,
        )

        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.preview).isNull()
        assertThat(next.lastAcknowledgedId).isEqualTo("m9")
    }

    @Test
    fun a_still_present_anchor_after_a_top_prune_counts_only_the_newer_tail() {
        val acknowledged = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("m1"), msg("m2"), msg("m3")),
            isNearBottom = true,
        )

        // m1 pruned from the top; m4 arrived. Anchor m3 still present.
        val next = ScrollAffordance.next(
            acknowledged,
            listOf(msg("m2"), msg("m3"), msg("m4")),
            isNearBottom = false,
        )

        assertThat(next.unreadCount).isEqualTo(1)
        assertThat(next.preview?.messageId).isEqualTo("m4")
    }

    // ---- boundaries ---------------------------------------------------------

    @Test
    fun a_single_message_at_the_bottom_is_acknowledged() {
        val next = ScrollAffordance.next(
            ScrollAffordanceState(),
            listOf(msg("only")),
            isNearBottom = true,
        )

        assertThat(next.isVisible).isFalse()
        assertThat(next.lastAcknowledgedId).isEqualTo("only")
    }
}

/**
 * The [BubbleContent] → [AffordanceMessage] projection. The reducer only needs a
 * message's identity, direction, deleted-ness, sender and a preview payload, so the
 * mapping distils the rich bubble down to that — deriving the preview kind from the
 * attachments present (image beats file beats plain text).
 */
class AffordanceMessageMappingTest {

    private fun bubble(
        id: String = "m1",
        text: String = "hi",
        outgoing: Boolean = false,
        deleted: Boolean = false,
        sender: String? = "Bob",
        images: List<BubbleImage> = emptyList(),
        files: List<BubbleFile> = emptyList(),
    ) = BubbleContent(
        messageId = id,
        text = text,
        isOutgoing = outgoing,
        isTranslated = false,
        originalText = null,
        senderName = sender,
        showSenderName = true,
        isEdited = false,
        isDeleted = deleted,
        createdAtIso = null,
        images = images,
        files = files,
    )

    @Test
    fun a_plain_message_maps_its_identity_direction_and_text() {
        val mapped = bubble(id = "x", text = "yo", outgoing = true, sender = "Me")
            .toAffordanceMessage()

        assertThat(mapped.id).isEqualTo("x")
        assertThat(mapped.text).isEqualTo("yo")
        assertThat(mapped.isOutgoing).isTrue()
        assertThat(mapped.senderName).isEqualTo("Me")
        assertThat(mapped.kind).isEqualTo(UnreadPreviewKind.Text)
    }

    @Test
    fun a_deleted_flag_passes_through() {
        assertThat(bubble(deleted = true).toAffordanceMessage().isDeleted).isTrue()
    }

    @Test
    fun an_image_attachment_maps_to_the_image_kind() {
        val mapped = bubble(images = listOf(BubbleImage(attachmentId = "a", url = "u")))
            .toAffordanceMessage()

        assertThat(mapped.kind).isEqualTo(UnreadPreviewKind.Image)
    }

    @Test
    fun a_file_attachment_maps_to_the_file_kind() {
        val mapped = bubble(files = listOf(BubbleFile(attachmentId = "a", name = "doc.pdf")))
            .toAffordanceMessage()

        assertThat(mapped.kind).isEqualTo(UnreadPreviewKind.File)
    }

    @Test
    fun an_image_wins_over_a_file_for_the_preview_kind() {
        val mapped = bubble(
            images = listOf(BubbleImage(attachmentId = "a", url = "u")),
            files = listOf(BubbleFile(attachmentId = "b", name = "doc.pdf")),
        ).toAffordanceMessage()

        assertThat(mapped.kind).isEqualTo(UnreadPreviewKind.Image)
    }
}
