package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

class ChatReplyJumpControllerTest {

    private fun bubble(
        id: String,
        replyToId: String? = null,
        isDeleted: Boolean = false,
        pinnedAtIso: String? = null,
        text: String = "message $id",
    ) = BubbleContent(
        messageId = id,
        text = text,
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = null,
        replyToId = replyToId,
        pinnedAtIso = pinnedAtIso,
    )

    private class Rig(initial: ChatUiState) {
        val flow = MutableStateFlow(initial)
        val controller = ChatReplyJumpController(ChatStateAccess(flow))
        val state: ChatUiState get() = flow.value
    }

    private fun rig(vararg messages: BubbleContent, replyThreadParentId: String? = null) =
        Rig(ChatUiState(messages = messages.toList(), replyThreadParentId = replyThreadParentId))

    // --- quoted-reply preview ---------------------------------------------------------

    @Test
    fun `tapping a reply preview scrolls to the loaded original`() {
        val r = rig(bubble("m1"), bubble("m2", replyToId = "m1"))

        r.controller.onReplyPreviewTap("m2")

        assertThat(r.state.scrollToMessageId).isEqualTo("m1")
    }

    @Test
    fun `a reply whose original is paged out stays put`() {
        val r = rig(bubble("m2", replyToId = "m1"))

        assertThat(ReplyJumpResolver.resolve("m2", listOf(ReplyLink("m2", "m1"))))
            .isEqualTo(ReplyJump.TargetNotLoaded)
        r.controller.onReplyPreviewTap("m2")

        assertThat(r.state.scrollToMessageId).isNull()
    }

    @Test
    fun `a reply whose original was deleted for the viewer and left the window stays put`() {
        val r = rig(bubble("m3"), bubble("m2", replyToId = "m-hidden"))

        r.controller.onReplyPreviewTap("m2")

        assertThat(r.state.scrollToMessageId).isNull()
    }

    @Test
    fun `tapping the preview of a message that is not a reply or is unknown is inert`() {
        val r = rig(bubble("m1"), bubble("m2", replyToId = "m1"))

        r.controller.onReplyPreviewTap("m1")
        r.controller.onReplyPreviewTap("ghost")

        assertThat(r.state.scrollToMessageId).isNull()
    }

    // --- reply-count pill and thread overlay ----------------------------------------------

    @Test
    fun `tapping the reply count scrolls to the first live reply`() {
        val r = rig(
            bubble("m1"),
            bubble("m2", replyToId = "m1", isDeleted = true),
            bubble("m3", replyToId = "m1"),
            bubble("m4", replyToId = "m1"),
        )

        r.controller.onReplyCountTap("m1")

        assertThat(r.state.scrollToMessageId).isEqualTo("m3")
    }

    @Test
    fun `a thread whose replies were all deleted has nowhere to jump`() {
        val r = rig(
            bubble("m1"),
            bubble("m2", replyToId = "m1", isDeleted = true),
            bubble("m3", replyToId = "m1", isDeleted = true),
        )

        r.controller.onReplyCountTap("m1")
        r.controller.openReplyThread("m1")

        assertThat(r.state.scrollToMessageId).isNull()
        assertThat(r.state.replyThreadParentId).isNull()
    }

    @Test
    fun `a message without replies has no thread to open`() {
        val r = rig(bubble("m1"))

        r.controller.onReplyCountTap("m1")
        r.controller.openReplyThread("m1")

        assertThat(r.state.scrollToMessageId).isNull()
        assertThat(r.state.replyThreadParentId).isNull()
    }

    @Test
    fun `long-pressing the pill opens the overlay and a reply tap scrolls to it and closes it`() {
        val r = rig(bubble("m1"), bubble("m2", replyToId = "m1"), bubble("m3", replyToId = "m1"))

        r.controller.openReplyThread("m1")
        assertThat(r.state.replyThreadParentId).isEqualTo("m1")
        assertThat(r.state.replyThreadOverlay?.replyCount).isEqualTo(2)

        r.controller.onReplyThreadReplyTap("m3")

        assertThat(r.state.scrollToMessageId).isEqualTo("m3")
        assertThat(r.state.replyThreadParentId).isNull()
    }

    @Test
    fun `a reply that left the overlay in the meantime is inert`() {
        val r = rig(
            bubble("m1"),
            bubble("m2", replyToId = "m1", isDeleted = true),
            bubble("m3", replyToId = "m1"),
            replyThreadParentId = "m1",
        )

        r.controller.onReplyThreadReplyTap("m2")

        assertThat(r.state.scrollToMessageId).isNull()
        assertThat(r.state.replyThreadParentId).isEqualTo("m1")
    }

    @Test
    fun `closing the overlay clears the focused thread`() {
        val r = rig(bubble("m1"), bubble("m2", replyToId = "m1"), replyThreadParentId = "m1")

        r.controller.closeReplyThread()

        assertThat(r.state.replyThreadParentId).isNull()
    }

    // --- pinned banner and pinned sheet ----------------------------------------------------

    @Test
    fun `the pinned banner scrolls to the newest pin`() {
        val r = rig(
            bubble("m1", pinnedAtIso = "2026-06-10T08:00:00Z"),
            bubble("m2", pinnedAtIso = "2026-06-11T08:00:00Z"),
            bubble("m3"),
        )

        r.controller.onPinnedBannerTap()

        assertThat(r.state.scrollToMessageId).isEqualTo("m2")
    }

    @Test
    fun `with nothing pinned the banner and the sheet stay shut`() {
        val r = rig(bubble("m1"), bubble("m2", pinnedAtIso = "2026-06-10T08:00:00Z", isDeleted = true))

        r.controller.onPinnedBannerTap()
        r.controller.openPinnedSheet()

        assertThat(r.state.scrollToMessageId).isNull()
        assertThat(r.state.isPinnedSheetOpen).isFalse()
    }

    @Test
    fun `picking a pin in the sheet scrolls to it and closes the sheet`() {
        val r = rig(
            bubble("m1", pinnedAtIso = "2026-06-10T08:00:00Z"),
            bubble("m2", pinnedAtIso = "2026-06-11T08:00:00Z"),
        )

        r.controller.openPinnedSheet()
        assertThat(r.state.isPinnedSheetOpen).isTrue()
        r.controller.onPinnedMessageTap("m1")

        assertThat(r.state.scrollToMessageId).isEqualTo("m1")
        assertThat(r.state.isPinnedSheetOpen).isFalse()
    }

    @Test
    fun `a message that is no longer pinned is inert in the sheet`() {
        val r = rig(bubble("m1", pinnedAtIso = "2026-06-10T08:00:00Z"), bubble("m2"))
        r.controller.openPinnedSheet()

        r.controller.onPinnedMessageTap("m2")

        assertThat(r.state.scrollToMessageId).isNull()
        assertThat(r.state.isPinnedSheetOpen).isTrue()
    }

    @Test
    fun `the screen acknowledges a performed scroll`() {
        val r = rig(bubble("m1"), bubble("m2", replyToId = "m1"))
        r.controller.onReplyPreviewTap("m2")
        assertThat(r.state.scrollToMessageId).isEqualTo("m1")

        r.controller.onScrollHandled()

        assertThat(r.state.scrollToMessageId).isNull()
    }
}
