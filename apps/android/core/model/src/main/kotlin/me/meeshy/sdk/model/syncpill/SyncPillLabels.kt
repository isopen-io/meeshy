package me.meeshy.sdk.model.syncpill

import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind

/**
 * Le libellé d'une opération en file, par CLÉ iOS (`sync.pill.*` du catalogue de l'app) : la couche écran la résout
 * en chaîne localisée. Les libellés décrivent l'action en cours (« Envoi de message »), et une ligne terminale se lit
 * comme un échec (« Message non envoyé ») — jamais un verbe actif oublié.
 *
 * Un genre sans équivalent iOS retombe sur la formulation générique la plus proche, choisie ici :
 * téléversement de média, épinglage, signets, préférences de conversation, « non lu » (voir `OutboxRowFacts`).
 */
object SyncPillLabels {
    fun keyFor(item: OutboxUiItem): String =
        if (item.status.isTerminal) failedKey(item) else inProgressKey(item)

    private fun inProgressKey(item: OutboxUiItem): String = when (item.kind) {
        OutboxUiKind.MESSAGE -> when (item.iconKind) {
            OutboxUiIcon.AUDIO -> "sync.pill.sending.audio"
            OutboxUiIcon.IMAGE -> "sync.pill.sending.image"
            OutboxUiIcon.VIDEO -> "sync.pill.sending.video"
            OutboxUiIcon.FILE -> "sync.pill.sending.file"
            OutboxUiIcon.STICKER -> "sync.pill.sending.sticker"
            OutboxUiIcon.TEXT, OutboxUiIcon.REACTION, OutboxUiIcon.NONE -> "sync.pill.sending.message"
        }
        OutboxUiKind.EDIT -> "sync.pill.editing.message"
        OutboxUiKind.DELETE -> "sync.pill.deleting.message"
        OutboxUiKind.REACTION -> "sync.pill.sending.reaction"
        OutboxUiKind.STORY ->
            if (item.iconKind == OutboxUiIcon.VIDEO) "sync.pill.publishing.story.video" else "sync.pill.publishing.story"
        OutboxUiKind.POST_COMMENT ->
            if (item.iconKind == OutboxUiIcon.AUDIO) "sync.pill.sending.comment.audio" else "sync.pill.sending.comment"
        OutboxUiKind.POST_REACTION -> "sync.pill.reacting.post"
        OutboxUiKind.OTHER -> otherKey(item.otherKey)
    }

    private fun failedKey(item: OutboxUiItem): String = when (item.kind) {
        OutboxUiKind.MESSAGE -> "sync.pill.failed.message"
        OutboxUiKind.EDIT -> "sync.pill.failed.edit"
        OutboxUiKind.DELETE -> "sync.pill.failed.delete"
        OutboxUiKind.REACTION -> "sync.pill.failed.reaction"
        OutboxUiKind.STORY -> "sync.pill.failed.story"
        OutboxUiKind.POST_COMMENT -> "sync.pill.failed.comment"
        OutboxUiKind.POST_REACTION -> "sync.pill.failed.postReaction"
        OutboxUiKind.OTHER -> failedOtherKey(item.otherKey)
    }

    private val otherSuffixes = mapOf(
        "markAsRead" to "markAsRead",
        "markStoryViewed" to "markStoryViewed",
        "reportAttachmentStatus" to "attachmentStatus",
        "sendFriendRequest" to "friendRequest",
        "respondFriendRequest" to "friendResponse",
        "blockUser" to "block",
        "unblockUser" to "unblock",
        "createConversation" to "createConversation",
        "updateConversation" to "updateConversation",
        "updateProfile" to "updateProfile",
        "updateSettings" to "updateSettings",
        "createPost" to "createPost",
        "createReel" to "createReel",
        "createStatus" to "createStatus",
        "deleteComment" to "deleteComment",
    )

    private fun otherKey(raw: String?): String =
        otherSuffixes[raw]?.let { "sync.pill.other.$it" } ?: "sync.pill.other.generic"

    private fun failedOtherKey(raw: String?): String =
        otherSuffixes[raw]?.let { "sync.pill.failed.$it" } ?: "sync.pill.failed.generic"
}
