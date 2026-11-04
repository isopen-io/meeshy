package me.meeshy.app.conversations

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.swipe.SwipeAction
import me.meeshy.ui.component.swipe.SwipeableRow
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Pose [content] dans le panneau d'actions révélées d'une rangée (iOS `ConversationSwipeActions`):
 * glisser vers le début de lecture révèle épingler / silence / verrou, vers la fin archiver / lu-non lu /
 * masquer, rendre obsolète. Le panneau reste ouvert, une seule rangée l'est à la fois, chaque action est aussi une action
 * personnalisée TalkBack et le sens s'inverse en RTL — tout cela vit dans [SwipeableRow]; ici on ne
 * choisit que QUOI révéler et ce que chaque bouton déclenche.
 */
@Composable
internal fun ConversationSwipeActions(
    swipe: ConversationSwipeActionModel,
    actions: ConversationRowActions,
    content: @Composable () -> Unit,
) {
    val labels = SwipeLabels(
        pin = stringResource(R.string.swipe_pin),
        unpin = stringResource(R.string.swipe_unpin),
        mute = stringResource(R.string.swipe_mute),
        unmute = stringResource(R.string.swipe_unmute),
        lock = stringResource(R.string.conversations_action_lock),
        unlock = stringResource(R.string.swipe_unlock),
        archive = stringResource(R.string.swipe_archive),
        unarchive = stringResource(R.string.swipe_unarchive),
        markRead = stringResource(R.string.swipe_mark_read),
        markUnread = stringResource(R.string.swipe_mark_unread),
        hide = stringResource(R.string.swipe_hide),
        obsolete = stringResource(R.string.conversations_action_make_obsolete),
    )
    val revealed = remember(swipe, labels, actions) {
        swipe.leading.map { it.toAction(labels, actions) } to swipe.trailing.map { it.toAction(labels, actions) }
    }
    SwipeableRow(leadingActions = revealed.first, trailingActions = revealed.second, content = content)
}

private data class SwipeLabels(
    val pin: String,
    val unpin: String,
    val mute: String,
    val unmute: String,
    val lock: String,
    val unlock: String,
    val archive: String,
    val unarchive: String,
    val markRead: String,
    val markUnread: String,
    val hide: String,
    val obsolete: String,
)

private fun ConversationSwipeItem.toAction(labels: SwipeLabels, actions: ConversationRowActions): SwipeAction =
    when (kind) {
        SwipeKind.PIN -> SwipeAction(
            MeeshyIcons.PinFilled, if (active) labels.unpin else labels.pin,
            MeeshyPalette.PinnedBlue, actions.onTogglePin,
        )
        SwipeKind.MUTE -> SwipeAction(
            if (active) MeeshyIcons.BellFilled else MeeshyIcons.BellOff,
            if (active) labels.unmute else labels.mute,
            MeeshyPalette.Neutral500, actions.onToggleMute,
        )
        SwipeKind.LOCK -> SwipeAction(
            if (active) MeeshyIcons.LockOpenFilled else MeeshyIcons.LockFilled,
            if (active) labels.unlock else labels.lock,
            MeeshyPalette.Warning, actions.onLockToggle,
        )
        SwipeKind.ARCHIVE -> SwipeAction(
            if (active) MeeshyIcons.Unarchive else MeeshyIcons.Archive,
            if (active) labels.unarchive else labels.archive,
            MeeshyPalette.Warning, actions.onToggleArchive,
        )
        SwipeKind.MARK_READ -> SwipeAction(
            MeeshyIcons.MarkChatRead, labels.markRead, MeeshyPalette.Indigo400, actions.onMarkRead,
        )
        SwipeKind.MARK_UNREAD -> SwipeAction(
            MeeshyIcons.MarkChatUnread, labels.markUnread, MeeshyPalette.Indigo400, actions.onMarkUnread,
        )
        SwipeKind.REMOVE -> SwipeAction(
            MeeshyIcons.EyeOffFilled, labels.hide, MeeshyPalette.Error, actions.onRemove,
        )
        SwipeKind.OBSOLETE -> SwipeAction(
            MeeshyIcons.DeleteForever, labels.obsolete, MeeshyPalette.Error, actions.onRequestObsolete,
        )
    }
