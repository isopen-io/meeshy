package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.JoinNoticePresentation
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.PinAction
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import org.junit.Test

/**
 * #12760 — the swipe and the TalkBack actions of a bubble offer exactly what the long-press menu
 * offers: the same [MessageActionContext], read through [MessageActionMenu].
 */
class MessageRowOfferTest {

    private fun bubble(
        id: String = "665f1c2ab3e4d5f6a7b8c9d0",
        isOutgoing: Boolean = false,
        isDeleted: Boolean = false,
        isPending: Boolean = false,
        deliveryStatus: DeliveryStatus = DeliveryStatus.Sent,
        isSystem: Boolean = false,
        isViewOnce: Boolean = false,
        exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
        callSummary: CallSummaryMetadata? = null,
        joinNotice: JoinNoticePresentation? = null,
        isArrivalsNotice: Boolean = false,
    ) = BubbleContent(
        messageId = id,
        text = "Bonjour",
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = null,
        deliveryStatus = deliveryStatus,
        isPending = isPending,
        isSystem = isSystem,
        isViewOnce = isViewOnce,
        exitOffer = exitOffer,
        callSummary = callSummary,
        joinNotice = joinNotice,
        isArrivalsNotice = isArrivalsNotice,
    )

    private val missedCall = CallSummaryMetadata(
        callId = "c-1",
        initiatorId = "u-ama",
        callType = CallSummaryMetadata.MediaType.AUDIO,
        outcome = CallSummaryMetadata.Outcome.MISSED,
        durationSeconds = 0,
        bytesTotal = null,
        bytesEstimated = false,
        networkQuality = null,
    )

    private val arrival = JoinNoticePresentation(primaryName = "Bruno", handle = null, showsNoAccountBadge = false, rules = null)

    private fun offer(bubble: BubbleContent, canWrite: Boolean = true) = MessageRowOffer.of(bubble, canWrite)

    @Test
    fun an_ordinary_message_offers_reply_then_forward() {
        val offer = offer(bubble())

        assertThat(offer.canReply).isTrue()
        assertThat(offer.canForward).isTrue()
        assertThat(offer.accessibilityActions).containsExactly(MessageRowAction.Reply, MessageRowAction.Forward).inOrder()
    }

    @Test
    fun an_own_message_is_answered_and_forwarded_like_any_other() {
        assertThat(offer(bubble(isOutgoing = true)).accessibilityActions)
            .containsExactly(MessageRowAction.Reply, MessageRowAction.Forward).inOrder()
    }

    @Test
    fun a_view_once_message_is_never_answered_nor_forwarded() {
        val offer = offer(bubble(isViewOnce = true, exitOffer = MessageExitOffer(ContentExitLaw.ViewOnce, holdsBlur = false, isEncrypted = false)))

        assertThat(offer.canReply).isFalse()
        assertThat(offer.canForward).isFalse()
        assertThat(offer.accessibilityActions).isEmpty()
    }

    @Test
    fun a_view_once_flag_alone_refuses_the_reply() {
        assertThat(offer(bubble(isViewOnce = true)).canReply).isFalse()
    }

    @Test
    fun a_notice_offers_nothing() {
        assertThat(offer(bubble(isSystem = true)).accessibilityActions).isEmpty()
    }

    @Test
    fun a_call_an_arrival_and_grouped_arrivals_are_answered_but_never_forwarded() {
        listOf(
            bubble(isSystem = true, callSummary = missedCall),
            bubble(isSystem = true, joinNotice = arrival),
            bubble(isSystem = true, isArrivalsNotice = true),
            bubble(isSystem = true).copy(quotedNoticeText = "Bob left the conversation"),
        ).forEach { notice ->
            val offer = offer(notice)
            assertThat(offer.canReply).isTrue()
            assertThat(offer.canForward).isFalse()
            assertThat(offer.accessibilityActions).containsExactly(MessageRowAction.Reply)
        }
    }

    @Test
    fun a_quotable_notice_is_not_answered_by_a_reader_who_may_not_write() {
        assertThat(offer(bubble(isSystem = true, callSummary = missedCall), canWrite = false).accessibilityActions).isEmpty()
    }

    @Test
    fun a_bubble_the_server_does_not_know_yet_offers_nothing() {
        val offer = offer(bubble(id = "cid_0b8f3c2e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", isOutgoing = true))

        assertThat(offer.accessibilityActions).isEmpty()
    }

    @Test
    fun a_reader_who_may_not_write_cannot_reply_but_may_still_forward() {
        val offer = offer(bubble(), canWrite = false)

        assertThat(offer.canReply).isFalse()
        assertThat(offer.accessibilityActions).containsExactly(MessageRowAction.Forward)
    }

    @Test
    fun an_encrypted_message_is_answered_but_never_forwarded() {
        val offer = offer(bubble(exitOffer = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = false, isEncrypted = true)))

        assertThat(offer.accessibilityActions).containsExactly(MessageRowAction.Reply)
    }

    @Test
    fun deleted_pending_and_failed_messages_offer_nothing() {
        listOf(
            bubble(isDeleted = true),
            bubble(isPending = true, isOutgoing = true),
            bubble(deliveryStatus = DeliveryStatus.Failed, isOutgoing = true),
        ).forEach { assertThat(offer(it).accessibilityActions).isEmpty() }
    }

    @Test
    fun the_row_offers_exactly_what_the_long_press_menu_offers() {
        val cases = listOf(
            bubble(),
            bubble(isViewOnce = true),
            bubble(isSystem = true),
            bubble(id = "cid_0b8f3c2e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"),
            bubble(exitOffer = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = false, isEncrypted = true)),
            bubble(isDeleted = true),
        )
        listOf(true, false).forEach { canWrite ->
            cases.forEach { candidate ->
                val menu = MessageActionMenu.actions(
                    candidate.actionContext(
                        canWrite = canWrite,
                        canEdit = true,
                        canDeleteForEveryone = true,
                        pinAction = PinAction.Pin,
                    ),
                )
                val row = offer(candidate, canWrite)
                assertThat(row.canReply).isEqualTo(MessageAction.Reply in menu)
                assertThat(row.canForward).isEqualTo(MessageAction.Forward in menu)
            }
        }
    }

    @Test
    fun the_menu_of_a_message_the_reader_may_not_answer_keeps_its_other_entries() {
        val menu = MessageActionMenu.actions(bubble(isViewOnce = true).actionContext(canWrite = true, pinAction = PinAction.Pin))

        assertThat(menu).doesNotContain(MessageAction.Reply)
        assertThat(menu).containsAtLeast(MessageAction.Star, MessageAction.DeleteForMe)
    }
}
