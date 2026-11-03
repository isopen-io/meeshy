package me.meeshy.app.conversations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.ManageAccounts
import androidx.compose.material.icons.filled.MarkChatRead
import androidx.compose.material.icons.filled.MarkChatUnread
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationCategoryPicker
import me.meeshy.sdk.model.conversationoptions.ConversationMoveMenu
import me.meeshy.sdk.model.conversationoptions.MoveMenuTarget
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les huit favoris du sous-menu « Favori », les mêmes qu'iOS. */
internal val FAVORITE_REACTION_CHOICES = listOf("⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡")

internal fun menuEntryTestTag(entry: ConversationMenuEntry): String = "conversation-menu-${entry.name}"

private enum class MenuPanel { ROOT, FAVORITE, MOVE, MORE }

/** Ce que le menu écrit : les gestes des sous-panneaux, les entrées passant toutes par [onEntry]. */
internal data class ConversationMenuPanelState(
    val currentReaction: String?,
    val categories: List<CategoryOption>,
    val currentCategoryId: String?,
)

/**
 * Le menu d'une rangée, DESSINÉ depuis [ConversationMenuModel] : aucune condition de visibilité ici,
 * le composable parcourt les groupes du modèle. Racine -> Favori / Déplacer vers / Plus d'options en
 * panneaux, haptique jouée par entrée avant son geste, entrées destructives en rouge.
 */
@Composable
internal fun ConversationMenuContent(
    model: ConversationMenuModel,
    panelState: ConversationMenuPanelState,
    accent: Color,
    onEntry: (ConversationMenuEntry) -> Unit,
    onSetReaction: (String?) -> Unit,
    onMove: (MoveMenuTarget) -> Unit,
    onCreateCategory: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var panel by remember { mutableStateOf(MenuPanel.ROOT) }
    val haptics = rememberMeeshyHaptics()
    val select: (ConversationMenuEntry) -> Unit = { entry ->
        when (entry) {
            ConversationMenuEntry.FAVORITE -> panel = MenuPanel.FAVORITE
            ConversationMenuEntry.MOVE -> panel = MenuPanel.MOVE
            ConversationMenuEntry.READING_MODE -> Unit
            else -> {
                haptics.feel(entry.haptic)
                onEntry(entry)
            }
        }
    }
    when (panel) {
        MenuPanel.ROOT -> RootPanel(model, panelState, accent, select, onOpenMore = { panel = MenuPanel.MORE }, modifier = modifier)
        MenuPanel.MORE -> Column(modifier) {
            BackHeader(stringResource(R.string.context_more_options)) { panel = MenuPanel.ROOT }
            model.more.forEach { EntryRow(it, panelState, select) }
        }
        MenuPanel.FAVORITE -> FavoritePanel(
            currentReaction = panelState.currentReaction,
            onBack = { panel = MenuPanel.ROOT },
            onSet = { emoji -> haptics.light(); onSetReaction(emoji) },
            modifier = modifier,
        )
        MenuPanel.MOVE -> MovePanel(
            panelState = panelState,
            onBack = { panel = MenuPanel.ROOT },
            onMove = { target -> haptics.light(); onMove(target) },
            onCreate = { name -> haptics.light(); onCreateCategory(name) },
            modifier = modifier,
        )
    }
}

@Composable
private fun RootPanel(
    model: ConversationMenuModel,
    panelState: ConversationMenuPanelState,
    accent: Color,
    select: (ConversationMenuEntry) -> Unit,
    onOpenMore: () -> Unit,
    modifier: Modifier,
) {
    val named = (model.entries.filterNot { it.opensSubmenu }).map { it to stringResource(it.labelRes()) }
    Column(
        modifier = modifier.semantics {
            customActions = named.map { (entry, label) ->
                CustomAccessibilityAction(label) { select(entry); true }
            }
        },
    ) {
        model.groups.forEach { group ->
            if (group.section.opensWithDivider) HorizontalDivider()
            when (group.section) {
                ConversationMenuSection.HEADER -> HeaderTiles(group.entries, accent, select)
                ConversationMenuSection.MORE -> DropdownMenuItem(
                    text = { Text(stringResource(R.string.context_more_options)) },
                    leadingIcon = { Icon(Icons.Filled.MoreHoriz, contentDescription = null) },
                    trailingIcon = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
                    onClick = onOpenMore,
                    modifier = Modifier.testTag(MORE_TEST_TAG),
                )
                else -> group.entries.forEach { EntryRow(it, panelState, select) }
            }
        }
    }
}

internal const val MORE_TEST_TAG = "conversation-menu-MORE"

@Composable
private fun HeaderTiles(
    entries: List<ConversationMenuEntry>,
    accent: Color,
    select: (ConversationMenuEntry) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        entries.forEach { entry ->
            val label = stringResource(entry.labelRes())
            Column(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 56.dp)
                    .clip(MaterialTheme.shapes.small)
                    .clickable { select(entry) }
                    .testTag(menuEntryTestTag(entry))
                    .semantics { contentDescription = label }
                    .padding(vertical = MeeshySpacing.xs),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(entry.icon(), contentDescription = null, tint = accent)
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = accent,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun EntryRow(
    entry: ConversationMenuEntry,
    panelState: ConversationMenuPanelState,
    select: (ConversationMenuEntry) -> Unit,
) {
    val tint = if (entry.isDestructive) MeeshyTheme.tokens.error else MeeshyTheme.tokens.textPrimary
    DropdownMenuItem(
        text = { Text(stringResource(entry.labelRes()), color = tint) },
        leadingIcon = {
            val hasFavorite = entry == ConversationMenuEntry.FAVORITE && !panelState.currentReaction.isNullOrBlank()
            Icon(if (hasFavorite) Icons.Filled.Star else entry.icon(), contentDescription = null, tint = tint)
        },
        trailingIcon = if (entry.opensSubmenu) {
            { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) }
        } else {
            null
        },
        onClick = { select(entry) },
        modifier = Modifier.testTag(menuEntryTestTag(entry)),
    )
}

@Composable
private fun BackHeader(title: String, onBack: () -> Unit) {
    DropdownMenuItem(
        text = { Text(title, style = MaterialTheme.typography.labelLarge) },
        leadingIcon = { Icon(MeeshyIcons.Back, contentDescription = null) },
        onClick = onBack,
        modifier = Modifier.testTag(BACK_TEST_TAG),
    )
    HorizontalDivider()
}

internal const val BACK_TEST_TAG = "conversation-menu-back"

@Composable
private fun FavoritePanel(
    currentReaction: String?,
    onBack: () -> Unit,
    onSet: (String?) -> Unit,
    modifier: Modifier,
) {
    Column(modifier) {
        BackHeader(stringResource(R.string.context_favorite), onBack)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            FAVORITE_REACTION_CHOICES.forEach { emoji ->
                val setLabel = stringResource(R.string.conversations_favorite_set_content_description, emoji)
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .clickable { onSet(emoji) }
                        .testTag("conversation-menu-favorite-$emoji")
                        .semantics { contentDescription = setLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = emoji, fontSize = 18.sp)
                }
            }
        }
        if (!currentReaction.isNullOrBlank()) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_remove_favorite)) },
                leadingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
                onClick = { onSet(null) },
                modifier = Modifier.testTag("conversation-menu-favorite-remove"),
            )
        }
    }
}

@Composable
private fun MovePanel(
    panelState: ConversationMenuPanelState,
    onBack: () -> Unit,
    onMove: (MoveMenuTarget) -> Unit,
    onCreate: (String) -> Unit,
    modifier: Modifier,
) {
    var query by remember { mutableStateOf("") }
    val picker = ConversationCategoryPicker.resolve(panelState.categories, panelState.currentCategoryId, query)
    val needle = query.trim()
    val targets = ConversationMoveMenu.targets(panelState.categories, panelState.currentCategoryId)
        .filter { needle.isEmpty() || it.name?.contains(needle, ignoreCase = true) == true }
    Column(modifier) {
        BackHeader(stringResource(R.string.conversations_action_move_to_category), onBack)
        TextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            placeholder = { Text(stringResource(R.string.conversations_category_search_hint)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            colors = TextFieldDefaults.colors(
                unfocusedContainerColor = MeeshyTheme.tokens.backgroundTertiary,
                focusedContainerColor = MeeshyTheme.tokens.backgroundTertiary,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
        if (picker.canCreate) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_create_category, needle)) },
                leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null) },
                onClick = { onCreate(needle) },
                modifier = Modifier.testTag("conversation-menu-move-create"),
            )
        }
        targets.forEach { target ->
            val name = target.name ?: stringResource(R.string.menu_my_conversations)
            DropdownMenuItem(
                text = { Text(name) },
                leadingIcon = {
                    Icon(if (target.categoryId == null) Icons.Filled.Inbox else Icons.Filled.Folder, contentDescription = null)
                },
                trailingIcon = if (target.isCurrent) {
                    { Icon(Icons.Filled.Check, contentDescription = null) }
                } else {
                    null
                },
                onClick = { onMove(target) },
                modifier = Modifier.testTag("conversation-menu-move-${target.categoryId ?: "none"}"),
            )
        }
    }
}

private fun MeeshyHaptics.feel(haptic: ConversationMenuHaptic) = when (haptic) {
    ConversationMenuHaptic.LIGHT -> light()
    ConversationMenuHaptic.MEDIUM -> medium()
    ConversationMenuHaptic.HEAVY -> heavy()
}

internal fun ConversationMenuEntry.labelRes(): Int = when (this) {
    ConversationMenuEntry.PIN -> R.string.conversations_action_pin
    ConversationMenuEntry.UNPIN -> R.string.conversations_action_unpin
    ConversationMenuEntry.MUTE -> R.string.conversations_action_mute
    ConversationMenuEntry.UNMUTE -> R.string.conversations_action_unmute
    ConversationMenuEntry.MARK_READ -> R.string.conversations_action_mark_read
    ConversationMenuEntry.MARK_UNREAD -> R.string.conversations_action_mark_unread
    ConversationMenuEntry.SEARCH -> R.string.context_search
    ConversationMenuEntry.CALL -> R.string.context_call
    ConversationMenuEntry.READING_MODE -> R.string.lentille_mode_menu_title
    ConversationMenuEntry.DETAILS -> R.string.context_details
    ConversationMenuEntry.VIEW_PROFILE -> R.string.row_menu_view_profile
    ConversationMenuEntry.RENAME -> R.string.context_rename
    ConversationMenuEntry.MANAGE_MEMBERS -> R.string.row_menu_manage_members
    ConversationMenuEntry.FAVORITE -> R.string.context_favorite
    ConversationMenuEntry.TAGS -> R.string.conversations_action_tags
    ConversationMenuEntry.MOVE -> R.string.conversations_action_move_to_category
    ConversationMenuEntry.MENTIONS_ONLY -> R.string.conversations_action_mentions_only
    ConversationMenuEntry.ALL_NOTIFICATIONS -> R.string.conversations_action_all_notifications
    ConversationMenuEntry.DISCARD_DRAFT -> R.string.conversations_action_discard_draft
    ConversationMenuEntry.INVITE -> R.string.context_invite_friends
    ConversationMenuEntry.LOCK -> R.string.conversations_action_lock
    ConversationMenuEntry.UNLOCK -> R.string.conversations_action_unlock
    ConversationMenuEntry.ARCHIVE -> R.string.conversations_action_archive
    ConversationMenuEntry.UNARCHIVE -> R.string.conversations_action_unarchive
    ConversationMenuEntry.BLOCK -> R.string.menu_block
    ConversationMenuEntry.UNBLOCK -> R.string.menu_unblock
    ConversationMenuEntry.REPORT -> R.string.context_report
    ConversationMenuEntry.ADMIN_OPEN -> R.string.context_admin_open
    ConversationMenuEntry.LEAVE -> R.string.dialogs_leave_title
    ConversationMenuEntry.DELETE -> R.string.dialogs_removal_delete
    ConversationMenuEntry.HIDE -> R.string.dialogs_removal_hide
    ConversationMenuEntry.DELETE_FOR_ALL -> R.string.conversations_action_delete_for_all
    ConversationMenuEntry.MAKE_OBSOLETE -> R.string.conversations_action_make_obsolete
}

private fun ConversationMenuEntry.icon(): ImageVector = when (this) {
    ConversationMenuEntry.PIN, ConversationMenuEntry.UNPIN -> Icons.Filled.PushPin
    ConversationMenuEntry.MUTE -> Icons.Filled.NotificationsOff
    ConversationMenuEntry.UNMUTE -> Icons.Filled.Notifications
    ConversationMenuEntry.MARK_READ -> Icons.Filled.MarkChatRead
    ConversationMenuEntry.MARK_UNREAD -> Icons.Filled.MarkChatUnread
    ConversationMenuEntry.SEARCH -> Icons.Filled.Search
    ConversationMenuEntry.CALL -> Icons.Filled.Call
    ConversationMenuEntry.READING_MODE -> Icons.Filled.Visibility
    ConversationMenuEntry.DETAILS -> Icons.Filled.Info
    ConversationMenuEntry.VIEW_PROFILE -> Icons.Filled.Person
    ConversationMenuEntry.RENAME -> Icons.Filled.Edit
    ConversationMenuEntry.MANAGE_MEMBERS -> Icons.Filled.ManageAccounts
    ConversationMenuEntry.FAVORITE -> Icons.Filled.StarBorder
    ConversationMenuEntry.TAGS -> Icons.AutoMirrored.Filled.Label
    ConversationMenuEntry.MOVE -> Icons.Filled.Folder
    ConversationMenuEntry.MENTIONS_ONLY, ConversationMenuEntry.ALL_NOTIFICATIONS -> Icons.Filled.AlternateEmail
    ConversationMenuEntry.DISCARD_DRAFT -> Icons.Filled.DeleteSweep
    ConversationMenuEntry.INVITE -> Icons.Filled.PersonAdd
    ConversationMenuEntry.LOCK -> Icons.Filled.Lock
    ConversationMenuEntry.UNLOCK -> Icons.Filled.LockOpen
    ConversationMenuEntry.ARCHIVE, ConversationMenuEntry.UNARCHIVE -> Icons.Filled.Archive
    ConversationMenuEntry.BLOCK, ConversationMenuEntry.UNBLOCK -> Icons.Filled.Block
    ConversationMenuEntry.REPORT -> Icons.Filled.Report
    ConversationMenuEntry.ADMIN_OPEN -> Icons.Filled.AdminPanelSettings
    ConversationMenuEntry.LEAVE -> Icons.AutoMirrored.Filled.Logout
    ConversationMenuEntry.DELETE -> Icons.Filled.Delete
    ConversationMenuEntry.HIDE -> Icons.Filled.VisibilityOff
    ConversationMenuEntry.DELETE_FOR_ALL, ConversationMenuEntry.MAKE_OBSOLETE -> Icons.Filled.DeleteForever
}
