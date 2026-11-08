package me.meeshy.sdk.outbox

import me.meeshy.sdk.model.sync.OutboxUiKind

/**
 * Comment la pastille formule un genre d'opération : son [kind] d'interface et, pour [OutboxUiKind.OTHER], la clé iOS
 * qui choisit le verbe ([otherKey], voir `SyncPillLabels`). Un `when` exhaustif et sans `else` : un `OutboxKind` né demain
 * ne compile pas tant qu'il n'a pas sa formulation.
 *
 * Les genres sans équivalent iOS empruntent le verbe le plus proche, choisi ici : « non lu » se lit comme les lus,
 * épingler et les préférences de conversation comme une mise à jour de conversation, les signets comme une réaction
 * à un post, le téléversement d'un média et les réglages audio / confidentialité / application comme les réglages ou
 * la formulation générique.
 */
public data class OutboxPillFacts(val kind: OutboxUiKind, val otherKey: String? = null)

public object OutboxRowFacts {

    public fun pillFacts(kind: OutboxKind): OutboxPillFacts = when (kind) {
        OutboxKind.SEND_MESSAGE, OutboxKind.SEND_E2EE_MESSAGE -> OutboxPillFacts(OutboxUiKind.MESSAGE)
        OutboxKind.EDIT_MESSAGE -> OutboxPillFacts(OutboxUiKind.EDIT)
        OutboxKind.DELETE_MESSAGE -> OutboxPillFacts(OutboxUiKind.DELETE)
        OutboxKind.ADD_REACTION, OutboxKind.REMOVE_REACTION -> OutboxPillFacts(OutboxUiKind.REACTION)
        OutboxKind.PUBLISH_STORY -> OutboxPillFacts(OutboxUiKind.STORY)
        OutboxKind.CREATE_COMMENT -> OutboxPillFacts(OutboxUiKind.POST_COMMENT)
        OutboxKind.LIKE_POST, OutboxKind.UNLIKE_POST, OutboxKind.BOOKMARK_POST, OutboxKind.UNBOOKMARK_POST ->
            OutboxPillFacts(OutboxUiKind.POST_REACTION)
        OutboxKind.READ_RECEIPT, OutboxKind.MARK_UNREAD -> other("markAsRead")
        OutboxKind.REPORT_ATTACHMENT_STATUS -> other("reportAttachmentStatus")
        OutboxKind.CONSUME_AFTER_READ, OutboxKind.CONSUME_VIEW_ONCE -> other("consumeAfterRead")
        OutboxKind.REPORT_CONTENT_CAPTURE -> other("reportContentCapture")
        OutboxKind.UPDATE_CONVERSATION_PREFS, OutboxKind.PIN_MESSAGE, OutboxKind.UNPIN_MESSAGE -> other("updateConversation")
        OutboxKind.UPDATE_PROFILE -> other("updateProfile")
        OutboxKind.UPDATE_SETTINGS,
        OutboxKind.UPDATE_PRIVACY_SETTINGS,
        OutboxKind.UPDATE_AUDIO_SETTINGS,
        OutboxKind.UPDATE_APPLICATION_SETTINGS,
        OutboxKind.UPDATE_PREFERENCE_CATEGORY,
        -> other("updateSettings")
        OutboxKind.UPLOAD_MEDIA -> other("uploadMedia")
        OutboxKind.BLOCK_USER -> other("blockUser")
        OutboxKind.UNBLOCK_USER -> other("unblockUser")
        OutboxKind.SEND_FRIEND_REQUEST -> other("sendFriendRequest")
        OutboxKind.RESPOND_FRIEND_REQUEST -> other("respondFriendRequest")
        OutboxKind.CREATE_POST -> other("createPost")
        OutboxKind.REPOST_POST -> other("repostPost")
        OutboxKind.REACT_STORY -> OutboxPillFacts(OutboxUiKind.POST_REACTION)
        OutboxKind.CREATE_CONVERSATION -> other("createConversation")
        OutboxKind.UPDATE_CONVERSATION -> other("updateConversation")
        OutboxKind.SETTINGS_ACTION -> other("updateSettings")
        OutboxKind.HIDE_FOR_ME, OutboxKind.MODERATION_DELETE -> OutboxPillFacts(OutboxUiKind.DELETE)
        OutboxKind.RESTORE_FOR_ME, OutboxKind.REMOVE_ATTACHMENT -> other("updateConversation")
        OutboxKind.MARK_RECEIVED -> other("markAsRead")
        OutboxKind.REPOST_STORY -> other("repostPost")
        OutboxKind.MARK_STORY_VIEWED -> other("markStoryViewed")
        OutboxKind.DELETE_COMMENT -> other("deleteComment")
        OutboxKind.TOGGLE_LIKE_COMMENT -> OutboxPillFacts(OutboxUiKind.POST_REACTION)
        OutboxKind.LEAVE_CONVERSATION -> other("updateConversation")
        OutboxKind.DELETE_CONVERSATION_FOR_ME, OutboxKind.DELETE_CONVERSATION_FOR_ALL -> OutboxPillFacts(OutboxUiKind.DELETE)
    }

    private fun other(key: String) = OutboxPillFacts(OutboxUiKind.OTHER, key)
}
