package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentEditing
import me.meeshy.sdk.model.StoryCommentMenuAction
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.icons.MeeshyIcons

/** Le « … » de la ligne (iOS `CommentMoreMenu`) : Copier, Modifier, Signaler, Supprimer, Retirer selon [actions]. */
@Composable
internal fun StoryCommentMoreMenu(
    comment: StoryComment,
    actions: List<StoryCommentMenuAction>,
    callbacks: StoryCommentRowCallbacks,
    onEdit: () -> Unit,
) {
    if (actions.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    Box {
        IconButton(onClick = { expanded = true }, modifier = Modifier.size(48.dp)) {
            Icon(
                imageVector = MeeshyIcons.MoreHorizontal,
                contentDescription = stringResource(R.string.stories_comments_overlay_more),
                tint = MeeshyMediaChromeColors.OnMediaSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            actions.forEach { action ->
                val destructive = action == StoryCommentMenuAction.DELETE || action == StoryCommentMenuAction.REMOVE
                DropdownMenuItem(
                    text = { Text(stringResource(action.label()), color = if (destructive) MeeshyPalette.Error else androidx.compose.ui.graphics.Color.Unspecified) },
                    onClick = {
                        expanded = false
                        when (action) {
                            StoryCommentMenuAction.COPY -> clipboard.setText(AnnotatedString(comment.content))
                            StoryCommentMenuAction.EDIT -> onEdit()
                            StoryCommentMenuAction.REPORT -> callbacks.onRequestReport(comment)
                            StoryCommentMenuAction.DELETE -> callbacks.onDelete(comment.id)
                            StoryCommentMenuAction.REMOVE -> callbacks.onRequestRemove(comment)
                        }
                    },
                )
            }
        }
    }
}

private fun StoryCommentMenuAction.label(): Int = when (this) {
    StoryCommentMenuAction.COPY -> R.string.stories_comments_overlay_copy
    StoryCommentMenuAction.EDIT -> R.string.stories_comments_overlay_edit
    StoryCommentMenuAction.REPORT -> R.string.stories_comments_overlay_report
    StoryCommentMenuAction.DELETE -> R.string.stories_comments_overlay_delete
    StoryCommentMenuAction.REMOVE -> R.string.stories_comments_overlay_remove
}

/**
 * L'édition en place (iOS #8709) : le texte remplace la ligne le temps de la saisie. « Enregistrer » n'est actif que
 * si le brouillon est non vide et différent ([StoryCommentEditing.draftToSend]) : aucune écriture sinon.
 */
@Composable
internal fun StoryCommentEditor(original: String, onCancel: () -> Unit, onSave: (String) -> Unit) {
    var draft by remember { mutableStateOf(original) }
    val focus = remember { FocusRequester() }
    val haptics = rememberMeeshyHaptics()
    val sendable = StoryCommentEditing.draftToSend(draft, original)
    val editingLabel = stringResource(R.string.stories_comments_overlay_editing)
    LaunchedEffect(Unit) { focus.requestFocus() }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            textStyle = TextStyle(color = MeeshyMediaChromeColors.OnMedia, fontSize = 14.sp),
            cursorBrush = SolidColor(MeeshyMediaChromeColors.OnMedia),
            maxLines = 6,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(MeeshyMediaChromeColors.MediaFill)
                .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.sm)
                .focusRequester(focus)
                .semantics { contentDescription = editingLabel },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
            TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.stories_comments_overlay_cancel), color = MeeshyMediaChromeColors.OnMediaSecondary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            TextButton(
                enabled = sendable != null,
                onClick = {
                    if (sendable == null) {
                        onCancel()
                    } else {
                        haptics.success()
                        onSave(sendable)
                    }
                },
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.stories_comments_overlay_save), color = MeeshyMediaChromeColors.OnMedia.copy(alpha = if (sendable != null) 1f else 0.4f), fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
