package me.meeshy.app.conversations

import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities.Removal

internal enum class SwipeKind { PIN, MUTE, LOCK, ARCHIVE, MARK_READ, MARK_UNREAD, REMOVE, OBSOLETE }

/**
 * Les actions de glissement d'une rangée, dans l'ordre d'iOS (`ConversationSwipeActions`) :
 * épingler, couper le son, verrouiller à gauche ; archiver, lu / non lu, masquer à droite, puis
 * « Rendre obsolète » (#14645) en dernier quand la passerelle l'accorde au lecteur.
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
            removal: Removal?,
            obsolete: Boolean = false,
        ): ConversationSwipePlan = ConversationSwipePlan(
            leading = listOf(SwipeKind.PIN, SwipeKind.MUTE, SwipeKind.LOCK),
            trailing = buildList {
                if (canToggleArchive) add(SwipeKind.ARCHIVE)
                add(if (hasUnread) SwipeKind.MARK_READ else SwipeKind.MARK_UNREAD)
                if (removal != null) add(SwipeKind.REMOVE)
                if (obsolete) add(SwipeKind.OBSOLETE)
            },
        )
    }
}
