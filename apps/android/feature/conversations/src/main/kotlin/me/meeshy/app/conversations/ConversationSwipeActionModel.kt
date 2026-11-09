package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
/**
 * Une action révélée par le balayage avec l'état qu'elle bascule: [active] dit « déjà épinglée / archivée » (donc l'action propose l'inverse). Les actions de lecture ne portent pas d'état:
 * leur [kind] dit déjà le sens (lu ou non lu).
 */
@Immutable
internal data class ConversationSwipeItem(val kind: SwipeKind, val active: Boolean)

/**
 * Le panneau d'actions d'une rangée, sans Compose: ce qui est révélé de chaque côté ET l'état d'icône de
 * chaque action. Data class, donc deux panneaux égaux ne font pas recomposer la rangée: l'état d'épingle,
 * d'archive et de lecture participe à l'égalité (miroir de la comparaison d'icônes
 * d'iOS, `ConversationListView+Rows`).
 */
@Immutable
internal data class ConversationSwipeActionModel(
    val leading: List<ConversationSwipeItem>,
    val trailing: List<ConversationSwipeItem>,
) {
    companion object {
        fun of(
            isPinned: Boolean,
            isArchived: Boolean,
            hasUnread: Boolean,
            canToggleArchive: Boolean,
        ): ConversationSwipeActionModel {
            val plan = ConversationSwipePlan.of(
                hasUnread = hasUnread,
                canToggleArchive = canToggleArchive,
            )
            fun item(kind: SwipeKind) = ConversationSwipeItem(
                kind = kind,
                active = when (kind) {
                    SwipeKind.PIN -> isPinned
                    SwipeKind.ARCHIVE -> isArchived
                    SwipeKind.MARK_READ, SwipeKind.MARK_UNREAD -> false
                },
            )
            return ConversationSwipeActionModel(plan.leading.map(::item), plan.trailing.map(::item))
        }
    }
}
