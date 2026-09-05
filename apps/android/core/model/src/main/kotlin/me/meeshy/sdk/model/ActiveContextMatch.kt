package me.meeshy.sdk.model

/**
 * Whether content addressed to [contentConversationId] / [contentPostId] is the very thing the
 * reader has on screen ([activeConversationId] / [activePostId]) — the single predicate behind
 * both silencing a fresh notification for the open thread ([NotificationToastPolicy]) and pulling
 * down a banner already shown when the reader opens its thread
 * (`NotificationBannerViewModel.setActiveContext`).
 *
 * A port of iOS `NotificationToastManager`'s `onConversationOpened` / `onPostOpened` +
 * `handleNewNotification` guard: a match requires the ACTIVE id to be present AND equal to the
 * content id. A null active id means nothing of that kind is on screen, so it never matches — a
 * null-vs-null pair is deliberately NOT a match (an empty screen does not silence an unrelated
 * banner). Conversation and post are OR-ed: either one being on screen consumes the content.
 */
public object ActiveContextMatch {

    public fun matches(
        contentConversationId: String?,
        contentPostId: String?,
        activeConversationId: String?,
        activePostId: String?,
    ): Boolean {
        val conversationMatch = activeConversationId != null &&
            contentConversationId == activeConversationId
        val postMatch = activePostId != null && contentPostId == activePostId
        return conversationMatch || postMatch
    }
}
