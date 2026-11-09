package me.meeshy.app.conversations

internal enum class SwipeKind { PIN, ARCHIVE, MARK_READ, MARK_UNREAD, OBSOLETE }

/**
 * Les actions de glissement d'une rangée : épingler au début ; archiver, lu / non lu à la fin, puis
 * « Rendre obsolète » (#14645) en dernier quand la passerelle l'accorde au lecteur. Silence, verrou et
 * suppression vivent dans le menu d'appui long (consigne porteur du 2026-11-09, #17244).
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
            obsolete: Boolean = false,
        ): ConversationSwipePlan = ConversationSwipePlan(
            leading = listOf(SwipeKind.PIN),
            trailing = buildList {
                if (canToggleArchive) add(SwipeKind.ARCHIVE)
                add(if (hasUnread) SwipeKind.MARK_READ else SwipeKind.MARK_UNREAD)
                if (obsolete) add(SwipeKind.OBSOLETE)
            },
        )
    }
}
