package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PinAction
import org.junit.Test

class MessageActionMenuTest {

    private fun ctx(
        isDeleted: Boolean = false,
        isPending: Boolean = false,
        isFailed: Boolean = false,
        isOutgoing: Boolean = false,
        isTranslated: Boolean = false,
        isShowingOriginal: Boolean = false,
        isStarred: Boolean = false,
        canEdit: Boolean = false,
        canDeleteForEveryone: Boolean = false,
        pinAction: PinAction = PinAction.Pin,
    ) = MessageActionContext(
        isDeleted = isDeleted,
        isPending = isPending,
        isFailed = isFailed,
        isOutgoing = isOutgoing,
        isTranslated = isTranslated,
        isShowingOriginal = isShowingOriginal,
        isStarred = isStarred,
        canEdit = canEdit,
        canDeleteForEveryone = canDeleteForEveryone,
        pinAction = pinAction,
    )

    // MARK: - isActionable derivation

    @Test
    fun a_clean_delivered_message_is_actionable() {
        assertThat(ctx().isActionable).isTrue()
    }

    @Test
    fun a_deleted_message_is_not_actionable() {
        assertThat(ctx(isDeleted = true).isActionable).isFalse()
    }

    @Test
    fun a_pending_message_is_not_actionable() {
        assertThat(ctx(isPending = true).isActionable).isFalse()
    }

    @Test
    fun a_failed_message_is_not_actionable() {
        assertThat(ctx(isFailed = true).isActionable).isFalse()
    }

    // MARK: - composition

    @Test
    fun a_basic_received_text_offers_reply_forward_copy_pin_star_delete_for_me_report() {
        assertThat(MessageActionMenu.actions(ctx())).containsExactly(
            MessageAction.Reply,
            MessageAction.Forward,
            MessageAction.Copy,
            MessageAction.Pin,
            MessageAction.Star,
            MessageAction.DeleteForMe,
            MessageAction.Report,
        ).inOrder()
    }

    @Test
    fun an_own_editable_deletable_text_adds_edit_and_delete_for_everyone_before_delete_for_me() {
        assertThat(
            MessageActionMenu.actions(
                ctx(isOutgoing = true, canEdit = true, canDeleteForEveryone = true),
            ),
        ).containsExactly(
            MessageAction.Reply,
            MessageAction.Forward,
            MessageAction.Copy,
            MessageAction.Pin,
            MessageAction.Star,
            MessageAction.Edit,
            MessageAction.DeleteForEveryone,
            MessageAction.DeleteForMe,
        ).inOrder()
    }

    @Test
    fun the_full_menu_keeps_a_stable_order() {
        assertThat(
            MessageActionMenu.actions(
                ctx(
                    isOutgoing = true,
                    isTranslated = true,
                    isShowingOriginal = false,
                    canEdit = true,
                    canDeleteForEveryone = true,
                    pinAction = PinAction.Pin,
                ),
            ),
        ).containsExactly(
            MessageAction.Reply,
            MessageAction.Forward,
            MessageAction.ShowOriginal,
            MessageAction.ExploreLanguages,
            MessageAction.Copy,
            MessageAction.Pin,
            MessageAction.Star,
            MessageAction.Edit,
            MessageAction.DeleteForEveryone,
            MessageAction.DeleteForMe,
        ).inOrder()
    }

    // MARK: - translation branch

    @Test
    fun a_translated_message_showing_translation_offers_to_show_the_original() {
        val actions = MessageActionMenu.actions(ctx(isTranslated = true, isShowingOriginal = false))
        assertThat(actions).contains(MessageAction.ShowOriginal)
        assertThat(actions).doesNotContain(MessageAction.ShowTranslation)
        assertThat(actions).contains(MessageAction.ExploreLanguages)
    }

    @Test
    fun a_translated_message_showing_the_original_offers_to_show_the_translation() {
        val actions = MessageActionMenu.actions(ctx(isTranslated = true, isShowingOriginal = true))
        assertThat(actions).contains(MessageAction.ShowTranslation)
        assertThat(actions).doesNotContain(MessageAction.ShowOriginal)
        assertThat(actions).contains(MessageAction.ExploreLanguages)
    }

    @Test
    fun an_untranslated_message_drops_the_translation_actions() {
        val actions = MessageActionMenu.actions(ctx(isTranslated = false))
        assertThat(actions).containsNoneOf(
            MessageAction.ShowOriginal,
            MessageAction.ShowTranslation,
            MessageAction.ExploreLanguages,
        )
    }

    // MARK: - pin branch

    @Test
    fun a_pinned_message_offers_unpin_not_pin() {
        val actions = MessageActionMenu.actions(ctx(pinAction = PinAction.Unpin))
        assertThat(actions).contains(MessageAction.Unpin)
        assertThat(actions).doesNotContain(MessageAction.Pin)
    }

    @Test
    fun an_unpinnable_message_drops_the_pin_toggle_entirely() {
        val actions = MessageActionMenu.actions(ctx(pinAction = PinAction.Unavailable))
        assertThat(actions).containsNoneOf(MessageAction.Pin, MessageAction.Unpin)
    }

    // MARK: - star branch

    @Test
    fun a_starred_message_offers_unstar_not_star() {
        val actions = MessageActionMenu.actions(ctx(isStarred = true))
        assertThat(actions).contains(MessageAction.Unstar)
        assertThat(actions).doesNotContain(MessageAction.Star)
    }

    // MARK: - report branch

    @Test
    fun an_incoming_actionable_message_offers_report_last() {
        val actions = MessageActionMenu.actions(ctx(isOutgoing = false))
        assertThat(actions).contains(MessageAction.Report)
        assertThat(actions.last()).isEqualTo(MessageAction.Report)
    }

    @Test
    fun an_own_message_never_offers_report() {
        // Divergence from iOS (which appends `.report` unconditionally): reporting your own
        // message to moderators is meaningless — Android hides it, like WhatsApp/Telegram.
        val actions = MessageActionMenu.actions(
            ctx(isOutgoing = true, canEdit = true, canDeleteForEveryone = true),
        )
        assertThat(actions).doesNotContain(MessageAction.Report)
    }

    @Test
    fun a_deleted_incoming_tombstone_never_offers_report() {
        val actions = MessageActionMenu.actions(ctx(isDeleted = true, pinAction = PinAction.Unavailable))
        assertThat(actions).doesNotContain(MessageAction.Report)
    }

    @Test
    fun a_pending_or_failed_message_never_offers_report() {
        assertThat(MessageActionMenu.actions(ctx(isPending = true))).doesNotContain(MessageAction.Report)
        assertThat(MessageActionMenu.actions(ctx(isFailed = true))).doesNotContain(MessageAction.Report)
    }

    // MARK: - inert states

    @Test
    fun a_deleted_tombstone_offers_nothing_when_the_pin_toggle_is_unavailable() {
        // A deleted message resolves to PinAction.Unavailable; no body to copy, not
        // actionable → the overlay collapses to an empty action list.
        assertThat(
            MessageActionMenu.actions(ctx(isDeleted = true, pinAction = PinAction.Unavailable)),
        ).isEmpty()
    }

    @Test
    fun a_pending_send_offers_only_copy_and_pin() {
        assertThat(
            MessageActionMenu.actions(ctx(isPending = true, isOutgoing = true, canEdit = true)),
        ).containsExactly(MessageAction.Copy, MessageAction.Pin).inOrder()
    }

    @Test
    fun a_failed_send_offers_only_copy_and_pin() {
        assertThat(
            MessageActionMenu.actions(ctx(isFailed = true, isOutgoing = true, canDeleteForEveryone = true)),
        ).containsExactly(MessageAction.Copy, MessageAction.Pin).inOrder()
    }

    @Test
    fun a_not_actionable_message_never_offers_reply_forward_star_or_delete() {
        val actions = MessageActionMenu.actions(
            ctx(isPending = true, isOutgoing = true, canEdit = true, canDeleteForEveryone = true, isStarred = true),
        )
        assertThat(actions).containsNoneOf(
            MessageAction.Reply,
            MessageAction.Forward,
            MessageAction.Star,
            MessageAction.Unstar,
            MessageAction.Edit,
            MessageAction.DeleteForEveryone,
            MessageAction.DeleteForMe,
        )
    }

    // MARK: - edit / delete gating

    @Test
    fun edit_requires_an_outgoing_message() {
        val actions = MessageActionMenu.actions(ctx(isOutgoing = false, canEdit = true))
        assertThat(actions).doesNotContain(MessageAction.Edit)
    }

    @Test
    fun edit_requires_the_can_edit_flag() {
        val actions = MessageActionMenu.actions(ctx(isOutgoing = true, canEdit = false))
        assertThat(actions).doesNotContain(MessageAction.Edit)
    }

    @Test
    fun delete_for_everyone_requires_the_can_delete_flag_but_delete_for_me_stays() {
        val actions = MessageActionMenu.actions(
            ctx(isOutgoing = true, canDeleteForEveryone = false),
        )
        assertThat(actions).doesNotContain(MessageAction.DeleteForEveryone)
        assertThat(actions).contains(MessageAction.DeleteForMe)
    }

    @Test
    fun copy_survives_on_a_non_actionable_message_that_is_not_deleted() {
        val actions = MessageActionMenu.actions(ctx(isFailed = true))
        assertThat(actions).contains(MessageAction.Copy)
    }
}
