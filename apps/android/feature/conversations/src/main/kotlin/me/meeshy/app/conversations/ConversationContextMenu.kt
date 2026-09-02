package me.meeshy.app.conversations

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MarkChatRead
import androidx.compose.material.icons.filled.MarkChatUnread
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationCategoryPicker
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Fixed favorite-reaction choices — parity iOS `ConversationListView+Overlays`'s "Favori" submenu. */
private val favoriteReactionChoices = listOf("⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡")
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ConversationContextMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    title: String,
    isPinned: Boolean,
    isMuted: Boolean,
    mentionsOnly: Boolean,
    isArchived: Boolean,
    hasUnread: Boolean,
    hasDraft: Boolean,
    categories: List<CategoryOption>,
    currentCategoryId: String?,
    previewMessages: List<LocalMessage>?,
    previewShowSender: Boolean,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    previewLabels: LastMessagePreviewLabels,
    isCreator: Boolean,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleMentionsOnly: () -> Unit,
    onToggleArchive: () -> Unit,
    onLeaveConversation: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDeleteForAll: () -> Unit,
    onRename: (String) -> Unit,
    currentCustomName: String?,
    onSetReaction: (String?) -> Unit,
    currentReaction: String?,
    onSetTags: (List<String>) -> Unit,
    currentTags: List<String>,
    onMarkRead: () -> Unit,
    onMarkUnread: () -> Unit,
    onDiscardDraft: () -> Unit,
    onAssignCategory: (String) -> Unit,
    onCreateCategory: (String) -> Unit,
    isLocked: Boolean,
    onLockToggle: () -> Unit,
) {
    var showLeaveConfirm by remember(expanded) { mutableStateOf(false) }
    var showDeleteForMeConfirm by remember(expanded) { mutableStateOf(false) }
    var showDeleteForAllConfirm by remember(expanded) { mutableStateOf(false) }
    var showRenameDialog by remember(expanded) { mutableStateOf(false) }
    var renameText by remember(expanded) { mutableStateOf(currentCustomName.orEmpty()) }
    var showTagsDialog by remember(expanded) { mutableStateOf(false) }
    var editedTags by remember(expanded) { mutableStateOf(currentTags) }
    var newTagText by remember(expanded) { mutableStateOf("") }
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        ConversationPreviewCard(
            title = title,
            isPinned = isPinned,
            isMuted = isMuted,
            messages = previewMessages,
            showSender = previewShowSender,
            currentUserId = currentUserId,
            currentUserPrefs = currentUserPrefs,
            labels = previewLabels,
        )
        HorizontalDivider()
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isPinned) R.string.conversations_action_unpin
                        else R.string.conversations_action_pin,
                    ),
                )
            },
            leadingIcon = { Icon(Icons.Filled.PushPin, contentDescription = null) },
            onClick = { onTogglePin(); onDismiss() },
        )
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isMuted) R.string.conversations_action_unmute
                        else R.string.conversations_action_mute,
                    ),
                )
            },
            leadingIcon = {
                Icon(
                    if (isMuted) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                    contentDescription = null,
                )
            },
            onClick = { onToggleMute(); onDismiss() },
        )
        // Mentions-only is meaningless while fully muted (parity iOS
        // `ConversationPreferencesTab`'s `isEnabled: !isMuted` gate on the same
        // toggle) — hidden rather than disabled: this menu has no established
        // pattern for a disabled row, whereas conditional visibility is already
        // used below for hasUnread/hasDraft.
        if (!isMuted) {
            DropdownMenuItem(
                text = {
                    Text(
                        stringResource(
                            if (mentionsOnly) R.string.conversations_action_all_notifications
                            else R.string.conversations_action_mentions_only,
                        ),
                    )
                },
                leadingIcon = { Icon(Icons.Filled.AlternateEmail, contentDescription = null) },
                onClick = { onToggleMentionsOnly(); onDismiss() },
            )
        }
        if (hasUnread) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_mark_read)) },
                leadingIcon = { Icon(Icons.Filled.MarkChatRead, contentDescription = null) },
                onClick = { onMarkRead(); onDismiss() },
            )
        } else {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_mark_unread)) },
                leadingIcon = { Icon(Icons.Filled.MarkChatUnread, contentDescription = null) },
                onClick = { onMarkUnread(); onDismiss() },
            )
        }
        if (hasDraft) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_discard_draft)) },
                leadingIcon = { Icon(Icons.Filled.DeleteSweep, contentDescription = null) },
                onClick = { onDiscardDraft(); onDismiss() },
            )
        }
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isArchived) R.string.conversations_action_unarchive
                        else R.string.conversations_action_archive,
                    ),
                )
            },
            leadingIcon = { Icon(Icons.Filled.Archive, contentDescription = null) },
            onClick = { onToggleArchive(); onDismiss() },
        )
        // Lock / unlock (parity iOS `ConversationLockSheet`): opens the PIN sheet
        // in the ViewModel-resolved mode (unlock a locked row, prompt for a code
        // on an unlocked one, or run first-time master-PIN setup then chain into
        // the code). The row's lock glyph re-derives from the store's live flow.
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isLocked) R.string.conversations_action_unlock
                        else R.string.conversations_action_lock,
                    ),
                )
            },
            leadingIcon = {
                Icon(
                    if (isLocked) Icons.Filled.LockOpen else Icons.Filled.Lock,
                    contentDescription = null,
                )
            },
            onClick = { onLockToggle(); onDismiss() },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_rename)) },
            leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
            onClick = { showRenameDialog = true },
        )
        // Favorite reaction (parity iOS `ConversationListView+Overlays`'s "Favori"
        // menu): a fixed 8-emoji set — no full picker, matching iOS exactly — plus
        // a conditional "Remove favorite" row shown only once one is set. Drives
        // the ConversationFilter.FAVORITES tab, which was previously unreachable
        // (nothing wrote ApiConversationPreferences.reaction).
        HorizontalDivider()
        Text(
            text = stringResource(R.string.conversations_action_favorite),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            favoriteReactionChoices.forEach { emoji ->
                val setLabel = stringResource(R.string.conversations_favorite_set_content_description, emoji)
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .clickable { onSetReaction(emoji); onDismiss() }
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
                onClick = { onSetReaction(null); onDismiss() },
            )
        }
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_tags)) },
            leadingIcon = { Icon(Icons.AutoMirrored.Filled.Label, contentDescription = null) },
            onClick = { showTagsDialog = true },
        )
        // Move-to-category / create-category (parity iOS `CategoryPickerField` +
        // `ConversationOptionsViewModel.setCategory`/`createCategoryAndSelect`): a
        // search field filters the pure ConversationCategoryPicker SSOT's displayed
        // list (every category but the current one), and a "Create …" row appears
        // whenever the trimmed query matches no known category name. Always shown
        // (not gated on a non-empty catalogue) so a user with zero categories can
        // create their first one from here. Idempotency on selecting an existing
        // category is enforced by ConversationCategoryReassignment in the ViewModel.
        var categoryQuery by remember(expanded) { mutableStateOf("") }
        val picker = ConversationCategoryPicker.resolve(categories, currentCategoryId, categoryQuery)
        HorizontalDivider()
        Text(
            text = stringResource(R.string.conversations_action_move_to_category),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
        )
        TextField(
            value = categoryQuery,
            onValueChange = { categoryQuery = it },
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
                text = {
                    Text(
                        stringResource(
                            R.string.conversations_action_create_category,
                            categoryQuery.trim(),
                        ),
                    )
                },
                leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null) },
                onClick = { onCreateCategory(categoryQuery.trim()); onDismiss() },
            )
        }
        picker.displayed.forEach { category ->
            DropdownMenuItem(
                text = { Text(category.name) },
                leadingIcon = { Icon(Icons.Filled.Folder, contentDescription = null) },
                onClick = { onAssignCategory(category.id); onDismiss() },
            )
        }
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_leave)) },
            leadingIcon = {
                Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
            },
            onClick = { showLeaveConfirm = true },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_delete_for_me)) },
            leadingIcon = { Icon(Icons.Filled.DeleteForever, contentDescription = null) },
            onClick = { showDeleteForMeConfirm = true },
        )
        if (isCreator) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_delete_for_all)) },
                leadingIcon = { Icon(Icons.Filled.DeleteForever, contentDescription = null) },
                onClick = { showDeleteForAllConfirm = true },
            )
        }
    }

    if (showLeaveConfirm) {
        AlertDialog(
            onDismissRequest = { showLeaveConfirm = false },
            title = { Text(stringResource(R.string.conversations_leave_confirm_title)) },
            text = { Text(stringResource(R.string.conversations_leave_confirm_message, title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLeaveConfirm = false
                        onLeaveConversation()
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_leave_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showLeaveConfirm = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showDeleteForMeConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteForMeConfirm = false },
            title = { Text(stringResource(R.string.conversations_delete_for_me_confirm_title)) },
            text = { Text(stringResource(R.string.conversations_delete_for_me_confirm_message, title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteForMeConfirm = false
                        onDeleteForMe()
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_delete_for_me_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteForMeConfirm = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showDeleteForAllConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteForAllConfirm = false },
            title = { Text(stringResource(R.string.conversations_delete_for_all_confirm_title)) },
            text = { Text(stringResource(R.string.conversations_delete_for_all_confirm_message, title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteForAllConfirm = false
                        onDeleteForAll()
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_delete_for_all_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteForAllConfirm = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showRenameDialog) {
        AlertDialog(
            onDismissRequest = { showRenameDialog = false },
            title = { Text(stringResource(R.string.conversations_rename_dialog_title)) },
            text = {
                TextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    singleLine = true,
                    label = { Text(stringResource(R.string.conversations_rename_field_label)) },
                    placeholder = { Text(title) },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRenameDialog = false
                        onRename(renameText)
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_rename_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showRenameDialog = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showTagsDialog) {
        AlertDialog(
            onDismissRequest = { showTagsDialog = false },
            title = { Text(stringResource(R.string.conversations_tags_dialog_title)) },
            text = {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextField(
                            value = newTagText,
                            onValueChange = { newTagText = it },
                            singleLine = true,
                            placeholder = { Text(stringResource(R.string.conversations_tags_field_hint)) },
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = {
                                editedTags = ConversationTagsEditor.add(editedTags, newTagText)
                                newTagText = ""
                            },
                        ) {
                            Icon(
                                Icons.Filled.Add,
                                contentDescription = stringResource(R.string.conversations_tags_add_content_description),
                            )
                        }
                    }
                    FlowRow(
                        modifier = Modifier.padding(top = MeeshySpacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    ) {
                        editedTags.forEach { tag ->
                            InputChip(
                                selected = false,
                                onClick = { editedTags = ConversationTagsEditor.remove(editedTags, tag) },
                                label = { Text(tag) },
                                trailingIcon = {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = stringResource(
                                            R.string.conversations_tags_remove_content_description,
                                            tag,
                                        ),
                                        modifier = Modifier.size(16.dp),
                                    )
                                },
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showTagsDialog = false
                        onSetTags(editedTags)
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_rename_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showTagsDialog = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }
}

/**
 * Hard-press preview card (iOS parity `ConversationPreviewView`): a compact
 * header (title + pin/mute badges) followed by up to a handful of recent
 * cached messages, one line each — rendered as the FIRST child of the
 * long-press [ConversationContextMenu] so a peek always precedes the action
 * list, mirroring iOS's native `.contextMenu(menuItems:preview:)`. [messages]
 * is `null` while [ConversationListViewModel.loadPreviewMessages] has not
 * resolved yet (a brief loading label); non-null-but-empty once loaded with
 * genuinely no cached history for that conversation.
 */
@Composable
private fun ConversationPreviewCard(
    title: String,
    isPinned: Boolean,
    isMuted: Boolean,
    messages: List<LocalMessage>?,
    showSender: Boolean,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    labels: LastMessagePreviewLabels,
) {
    Column(
        modifier = Modifier
            .widthIn(max = 280.dp)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (isPinned) {
                Icon(
                    imageVector = Icons.Filled.PushPin,
                    contentDescription = stringResource(R.string.conversations_badge_pinned),
                    tint = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier
                        .size(14.dp)
                        .padding(end = MeeshySpacing.xs),
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (isMuted) {
                Icon(
                    imageVector = Icons.Filled.NotificationsOff,
                    contentDescription = stringResource(R.string.conversations_badge_muted),
                    tint = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier
                        .size(14.dp)
                        .padding(start = MeeshySpacing.xs),
                )
            }
        }
        Spacer(Modifier.height(MeeshySpacing.xs))
        when {
            messages == null -> Text(
                text = stringResource(R.string.conversations_preview_loading),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
            messages.isEmpty() -> Text(
                text = stringResource(R.string.conversations_no_messages),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
            else -> previewLines(
                recent = messages,
                currentUserId = currentUserId,
                showSender = showSender,
                prefs = currentUserPrefs,
                labels = labels,
            ).forEach { line ->
                Text(
                    text = line,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(vertical = 1.dp),
                )
            }
        }
    }
}
