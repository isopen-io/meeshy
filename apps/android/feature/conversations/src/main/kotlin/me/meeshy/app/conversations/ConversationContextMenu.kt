package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.conversationoptions.CategoryReassignment
import me.meeshy.sdk.model.conversationoptions.ConversationMoveMenu
import me.meeshy.sdk.model.conversationoptions.ConversationTagsEditor
import me.meeshy.sdk.model.conversationoptions.MoveMenuTarget
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le menu contextuel d'une rangée (#17244) : une grande carte d'aperçu au-dessus d'un menu compact
 * qu'on tire vers le haut ([ConversationLongPressPeek]). Le menu garde sa rangée de tête
 * ([ConversationQuickActions]) toujours visible, puis [ConversationMenuContent] dessiné depuis le
 * reste du [ConversationMenuModel]. Les gestes qui ouvrent un dialogue (renommer, quitter, supprimer,
 * bloquer, signaler, verrouiller) passent par [ConversationRowActions] et le contrôleur de dialogues
 * de la liste ; ne restent ici que les confirmations propres au menu (supprimer pour tous, rendre
 * obsolète) et l'éditeur d'étiquettes.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ConversationContextMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    title: String,
    isPinned: Boolean,
    isMuted: Boolean,
    model: ConversationMenuModel,
    panelState: ConversationMenuPanelState,
    accent: Color,
    previewMessages: List<LocalMessage>?,
    previewUnavailable: Boolean,
    previewShowSender: Boolean,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    previewLabels: LastMessagePreviewLabels,
    isLocked: Boolean,
    currentTags: List<String>,
    actions: ConversationRowActions,
    onManageMembers: (() -> Unit)?,
    onSelectReadingMode: (ReadingModeChoice) -> Unit = {},
) {
    var showObsoleteConfirm by remember(expanded) { mutableStateOf(false) }
    var showDeleteForAllConfirm by remember(expanded) { mutableStateOf(false) }
    var showTagsDialog by remember(expanded) { mutableStateOf(false) }
    var editedTags by remember(expanded) { mutableStateOf(currentTags) }
    var newTagText by remember(expanded) { mutableStateOf("") }
    val onEntry: (ConversationMenuEntry) -> Unit = { entry ->
        when (entry) {
            ConversationMenuEntry.TAGS -> showTagsDialog = true
            ConversationMenuEntry.DELETE_FOR_ALL -> showDeleteForAllConfirm = true
            ConversationMenuEntry.MAKE_OBSOLETE -> showObsoleteConfirm = true
            else -> {
                actions.perform(entry, onManageMembers)
                onDismiss()
            }
        }
    }
    if (expanded) {
        val onMove: (MoveMenuTarget) -> Unit = { target ->
            when (val outcome = ConversationMoveMenu.reassignment(panelState.currentCategoryId, target)) {
                is CategoryReassignment.AssignTo -> actions.onAssignCategory(outcome.categoryId)
                CategoryReassignment.Clear -> actions.onRemoveCategory()
                CategoryReassignment.Unchanged -> Unit
            }
            onDismiss()
        }
        ConversationLongPressPeek(
            onDismiss = onDismiss,
            cardLabel = stringResource(R.string.accessibility_conversation_with, title),
            cardBody = {
                ConversationPeekCardBody(
                    messages = previewMessages,
                    isUnavailable = previewUnavailable,
                    isSealed = isLocked,
                    showSender = previewShowSender,
                    currentUserId = currentUserId,
                    currentUserPrefs = currentUserPrefs,
                    labels = previewLabels,
                )
            },
            quickActions = { ConversationQuickActions(model = model, accent = accent, onEntry = onEntry) },
            allActions = {
                ConversationMenuContent(
                    model = model.withoutQuickActions(),
                    panelState = panelState,
                    accent = accent,
                    onEntry = onEntry,
                    onSetReaction = { emoji -> actions.onSetReaction(emoji); onDismiss() },
                    onMove = onMove,
                    onCreateCategory = { name -> actions.onCreateCategory(name); onDismiss() },
                    onSelectReadingMode = { choice -> onSelectReadingMode(choice); onDismiss() },
                )
            },
        )
    }

    if (showObsoleteConfirm) {
        AlertDialog(
            onDismissRequest = { showObsoleteConfirm = false },
            title = { Text(stringResource(R.string.conversations_obsolete_confirm_title)) },
            text = { Text(stringResource(R.string.conversations_obsolete_confirm_message, title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showObsoleteConfirm = false
                        actions.onMakeObsolete()
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_obsolete_confirm_button), color = MeeshyPalette.Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showObsoleteConfirm = false }) {
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
                        actions.onDeleteForAll()
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
                        actions.onSetTags(editedTags)
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
