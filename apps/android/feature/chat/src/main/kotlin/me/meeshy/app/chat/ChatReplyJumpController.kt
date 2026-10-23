package me.meeshy.app.chat

/**
 * Every "take me to that message" gesture of the conversation screen: the quoted-reply
 * preview, the reply-count pill and its thread overlay, the pinned banner and the pinned
 * sheet. Each resolves its target from the bubbles already loaded and, when there is one,
 * requests the scroll through [ChatUiState.scrollToMessageId] — a target that is paged out,
 * deleted or never existed is inert, never a crash on an absent index.
 *
 * Pure state transitions: no repository, no coroutine, so it is driven in a plain test over
 * a `ChatStateAccess(MutableStateFlow(ChatUiState(messages = …)))`.
 */
internal class ChatReplyJumpController(private val state: ChatStateAccess) {

    /**
     * A quoted-reply preview was tapped on the bubble [messageId]. When the quoted
     * original is currently loaded, request a scroll to it; a paged-out original or a
     * non-reply is inert (never a crash on an absent target). See [ReplyJumpResolver].
     */
    fun onReplyPreviewTap(messageId: String) {
        val links = state.value.messages.map { ReplyLink(it.messageId, it.replyToId) }
        val target = (ReplyJumpResolver.resolve(messageId, links) as? ReplyJump.Scroll)?.targetMessageId
            ?: return
        state.update { it.copy(scrollToMessageId = target) }
    }

    /**
     * The reply-count pill on message [messageId] was tapped: scroll to the first
     * reply in its thread. A message with no replies has no thread and is inert.
     * See [ReplyThreads].
     */
    fun onReplyCountTap(messageId: String) {
        val links = state.value.messages.map { ReplyLink(it.messageId, it.replyToId, it.isDeleted) }
        val thread = ReplyThreads.of(links).threadFor(messageId) ?: return
        state.update { it.copy(scrollToMessageId = thread.firstReplyId) }
    }

    /**
     * Long-pressing the reply-count pill on message [messageId] opens the focused
     * reply-thread overlay (the pill *tap* still scrolls to the first reply). Inert when
     * the message has no live thread — no empty overlay. See [ReplyThreadOverlay].
     */
    fun openReplyThread(messageId: String) {
        val links = state.value.messages.map { it.toThreadMessage() }
        if (ReplyThreadOverlay.of(messageId, links) == null) return
        state.update { it.copy(replyThreadParentId = messageId) }
    }

    /** Dismisses the reply-thread overlay. */
    fun closeReplyThread() {
        state.update { it.copy(replyThreadParentId = null) }
    }

    /**
     * A reply row in the thread overlay was tapped: scroll to that reply and close the
     * overlay. A messageId not among the overlay's current replies is inert (never a
     * crash on a since-removed / absent target).
     */
    fun onReplyThreadReplyTap(messageId: String) {
        val overlay = state.value.replyThreadOverlay ?: return
        if (overlay.replies.none { it.messageId == messageId }) return
        state.update { it.copy(scrollToMessageId = messageId, replyThreadParentId = null) }
    }

    /**
     * The pinned-message banner was tapped: scroll to the newest pinned message.
     * When nothing is pinned the banner is absent, so this is inert.
     * See [PinnedMessages].
     */
    fun onPinnedBannerTap() {
        val target = state.value.pinnedBanner?.messageId ?: return
        state.update { it.copy(scrollToMessageId = target) }
    }

    /**
     * Opens the full pinned-messages sheet (the banner shows one at a time; the
     * sheet lists every pin). Inert when nothing is pinned — no empty sheet.
     * See [PinnedMessagesList].
     */
    fun openPinnedSheet() {
        if (state.value.pinnedMessages.isEmpty()) return
        state.update { it.copy(isPinnedSheetOpen = true) }
    }

    /** Dismisses the pinned-messages sheet. */
    fun closePinnedSheet() {
        state.update { it.copy(isPinnedSheetOpen = false) }
    }

    /**
     * A row in the pinned-messages sheet was tapped: scroll to that message and
     * close the sheet. A messageId not among the currently-pinned messages is inert
     * (never a crash on a since-unpinned/absent target).
     */
    fun onPinnedMessageTap(messageId: String) {
        if (state.value.pinnedMessages.none { it.messageId == messageId }) return
        state.update { it.copy(scrollToMessageId = messageId, isPinnedSheetOpen = false) }
    }

    /** The pending reply-jump scroll has been performed by the screen. */
    fun onScrollHandled() {
        state.update { it.copy(scrollToMessageId = null) }
    }
}
