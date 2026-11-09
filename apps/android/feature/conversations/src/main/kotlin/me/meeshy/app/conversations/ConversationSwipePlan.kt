package me.meeshy.app.conversations

internal enum class SwipeKind { PIN, ARCHIVE, MARK_READ, MARK_UNREAD }

/**
 * Les actions de glissement d'une rangée : épingler au début ; archiver, lu / non lu à la fin. Silence,
 * verrou, suppression et « Rendre obsolète » vivent dans le menu d'appui long SEULEMENT (consignes
 * porteur du 2026-11-09, #17244) : aucun glissement ne retire une conversation.
 * Pure : la rangée n'a qu'à dessiner et à relayer.
 */
internal data class ConversationSwipePlan(
    val leading: List<SwipeKind>,
    val trailing: List<SwipeKind>,
) {
    companion object {
        fun of(
            hasUnread: Boolean,
            canToggleArchive: Boolean,
        ): ConversationSwipePlan = ConversationSwipePlan(
            leading = listOf(SwipeKind.PIN),
            trailing = buildList {
                if (canToggleArchive) add(SwipeKind.ARCHIVE)
                add(if (hasUnread) SwipeKind.MARK_READ else SwipeKind.MARK_UNREAD)
            },
        )
    }
}
