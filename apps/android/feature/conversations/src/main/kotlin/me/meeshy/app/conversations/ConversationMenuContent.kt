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
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuEntry
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les huit favoris du sous-menu « Favori », les mêmes qu'iOS. */
internal val FAVORITE_REACTION_CHOICES = listOf("⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡")

internal fun menuEntryTestTag(entry: ConversationMenuEntry): String = "conversation-menu-${entry.name}"

private enum class MenuPanel { ROOT, FAVORITE, MOVE, MORE, READING_MODE }

/** Ce que le menu écrit : les gestes des sous-panneaux, les entrées passant toutes par [onEntry]. */
internal data class ConversationMenuPanelState(
    val currentReaction: String?,
    val categories: List<CategoryOption>,
    val currentCategoryId: String?,
    /** Les six entrées du sous-menu « Mode de lecture » (ordre, coche, raisons) ; vide = sous-menu absent. */
    val readingModes: List<ReadingModeMenuEntry> = emptyList(),
)

/**
 * Le menu d'une rangée, DESSINÉ depuis [ConversationMenuModel] : aucune condition de visibilité ici,
 * le composable parcourt les groupes du modèle. Racine -> Plus -> Favori / Déplacer vers / Mode de lecture en
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
    onSelectReadingMode: (ReadingModeChoice) -> Unit = {},
) {
    var panel by remember { mutableStateOf(MenuPanel.ROOT) }
    val haptics = rememberMeeshyHaptics()
    val select: (ConversationMenuEntry) -> Unit = { entry ->
        when (entry) {
            ConversationMenuEntry.FAVORITE -> panel = MenuPanel.FAVORITE
            ConversationMenuEntry.MOVE -> panel = MenuPanel.MOVE
            ConversationMenuEntry.READING_MODE -> panel = MenuPanel.READING_MODE
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
            onBack = { panel = MenuPanel.MORE },
            onSet = { emoji -> haptics.light(); onSetReaction(emoji) },
            modifier = modifier,
        )
        MenuPanel.READING_MODE -> ReadingModePanel(
            entries = panelState.readingModes,
            accent = accent,
            onBack = { panel = MenuPanel.MORE },
            onChoose = { choice -> haptics.light(); onSelectReadingMode(choice) },
            modifier = modifier,
        )
        MenuPanel.MOVE -> MovePanel(
            panelState = panelState,
            onBack = { panel = MenuPanel.MORE },
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
                    leadingIcon = { Icon(MeeshyIcons.MoreHorizontal, contentDescription = null) },
                    trailingIcon = { Icon(MeeshyIcons.ChevronForward, contentDescription = null) },
                    onClick = onOpenMore,
                    modifier = Modifier.testTag(MORE_TEST_TAG),
                )
                else -> group.entries.forEach { EntryRow(it, panelState, select) }
            }
        }
    }
}

/**
 * La rangée de tête du menu (Épingler · Silence · Lu), seule visible quand le menu de l'appui long
 * est compact (#17244). Même haptique et même geste que dans le menu complet.
 */
@Composable
internal fun ConversationQuickActions(
    model: ConversationMenuModel,
    accent: Color,
    onEntry: (ConversationMenuEntry) -> Unit,
) {
    if (model.header.isEmpty()) return
    val haptics = rememberMeeshyHaptics()
    HeaderTiles(model.header, accent) { entry ->
        haptics.feel(entry.haptic)
        onEntry(entry)
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
            Icon(if (hasFavorite) MeeshyIcons.StarFilled else entry.icon(), contentDescription = null, tint = tint)
        },
        trailingIcon = if (entry.opensSubmenu) {
            { Icon(MeeshyIcons.ChevronForward, contentDescription = null) }
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
                leadingIcon = { Icon(MeeshyIcons.Close, contentDescription = null) },
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
            leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
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
                leadingIcon = { Icon(MeeshyIcons.Add, contentDescription = null) },
                onClick = { onCreate(needle) },
                modifier = Modifier.testTag("conversation-menu-move-create"),
            )
        }
        targets.forEach { target ->
            val name = target.name ?: stringResource(R.string.menu_my_conversations)
            DropdownMenuItem(
                text = { Text(name) },
                leadingIcon = {
                    Icon(if (target.categoryId == null) MeeshyIcons.Inbox else MeeshyIcons.FolderFilled, contentDescription = null)
                },
                trailingIcon = if (target.isCurrent) {
                    { Icon(MeeshyIcons.Check, contentDescription = null) }
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
    ConversationMenuEntry.PIN, ConversationMenuEntry.UNPIN -> MeeshyIcons.PinFilled
    ConversationMenuEntry.MUTE -> MeeshyIcons.BellOff
    ConversationMenuEntry.UNMUTE -> MeeshyIcons.BellFilled
    ConversationMenuEntry.MARK_READ -> MeeshyIcons.MarkChatRead
    ConversationMenuEntry.MARK_UNREAD -> MeeshyIcons.MarkChatUnread
    ConversationMenuEntry.READING_MODE -> MeeshyIcons.EyeFilled
    ConversationMenuEntry.DETAILS -> MeeshyIcons.InfoFilled
    ConversationMenuEntry.VIEW_PROFILE -> MeeshyIcons.PersonFilled
    ConversationMenuEntry.RENAME -> MeeshyIcons.EditFilled
    ConversationMenuEntry.MANAGE_MEMBERS -> MeeshyIcons.ManageAccounts
    ConversationMenuEntry.FAVORITE -> MeeshyIcons.StarBorder
    ConversationMenuEntry.TAGS -> MeeshyIcons.LabelTag
    ConversationMenuEntry.MOVE -> MeeshyIcons.FolderFilled
    ConversationMenuEntry.MENTIONS_ONLY, ConversationMenuEntry.ALL_NOTIFICATIONS -> MeeshyIcons.Mention
    ConversationMenuEntry.DISCARD_DRAFT -> MeeshyIcons.DeleteSweep
    ConversationMenuEntry.INVITE -> MeeshyIcons.PersonAdd
    ConversationMenuEntry.LOCK -> MeeshyIcons.LockFilled
    ConversationMenuEntry.UNLOCK -> MeeshyIcons.LockOpenFilled
    ConversationMenuEntry.ARCHIVE, ConversationMenuEntry.UNARCHIVE -> MeeshyIcons.Archive
    ConversationMenuEntry.BLOCK, ConversationMenuEntry.UNBLOCK -> MeeshyIcons.Block
    ConversationMenuEntry.REPORT -> MeeshyIcons.Report
    ConversationMenuEntry.ADMIN_OPEN -> MeeshyIcons.AdminPanel
    ConversationMenuEntry.LEAVE -> MeeshyIcons.SignOut
    ConversationMenuEntry.DELETE -> MeeshyIcons.DeleteFilled
    ConversationMenuEntry.HIDE -> MeeshyIcons.EyeOffFilled
    ConversationMenuEntry.DELETE_FOR_ALL, ConversationMenuEntry.MAKE_OBSOLETE -> MeeshyIcons.DeleteForever
}
