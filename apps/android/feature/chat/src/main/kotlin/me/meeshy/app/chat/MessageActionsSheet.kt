package me.meeshy.app.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mood
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.PinAction
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Seconds of the release velocity to project past the current translation when
 * resolving the overlay drag — the Compose analogue of UIKit's
 * `predictedEndTranslation`. Feeds [MessageOverlayDragLaw.outcome]'s `predicted`.
 */
private const val OVERLAY_DRAG_VELOCITY_PROJECTION_SECONDS = 0.1f

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MessageActionsSheet(
    bubble: BubbleContent,
    canEdit: Boolean,
    canDeleteForEveryone: Boolean,
    pinAction: PinAction,
    ownReactions: Set<String>,
    quickReactions: List<String>,
    accentColor: Color,
    onReact: (String) -> Unit,
    onExpandPicker: () -> Unit,
    onEdit: () -> Unit,
    onDeleteForEveryone: () -> Unit,
    onDeleteForMe: () -> Unit,
    onReply: () -> Unit,
    onForward: () -> Unit,
    onPin: () -> Unit,
    onStar: () -> Unit,
    onToggleOriginal: () -> Unit,
    onExploreLanguages: () -> Unit,
    onReport: () -> Unit,
    onOpenFile: () -> Unit,
    onShareFile: () -> Unit,
    onDismiss: () -> Unit,
    hostedEntries: Set<MessageAction> = emptySet(),
    onViews: () -> Unit = {},
    onHistory: () -> Unit = {},
    onSentiment: () -> Unit = {},
    onSelect: () -> Unit = {},
    onExportCard: () -> Unit = {},
    canWrite: Boolean = true,
) {
    val clipboard = LocalClipboardManager.current
    var confirmingDelete by remember { mutableStateOf(false) }
    val ctx = bubble.actionContext(
        canWrite = canWrite,
        canEdit = canEdit,
        canDeleteForEveryone = canDeleteForEveryone,
        pinAction = pinAction,
        hostedEntries = hostedEntries,
    )
    // The vertical drag on the grabber is resolved by the pure [MessageOverlayDragLaw]
    // SSOT: a strong swipe up expands the compact action sheet into the full language
    // explorer ("Plus…" / Menu 2), a strong swipe down dismisses, anything weaker
    // springs back. The lift follows the finger via [MessageOverlayDragLaw.displayOffset].
    val scope = rememberCoroutineScope()
    val liftOffset = remember { Animatable(0f) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        dragHandle = {
            OverlayDragHandle(
                accentColor = accentColor,
                onDrag = { translation -> scope.launch { liftOffset.snapTo(MessageOverlayDragLaw.displayOffset(translation)) } },
                onSettle = { scope.launch { liftOffset.animateTo(0f) } },
                onOutcome = { outcome ->
                    when (outcome) {
                        MessageOverlayDragOutcome.OpenMore -> onExploreLanguages()
                        MessageOverlayDragOutcome.Dismiss -> onDismiss()
                        MessageOverlayDragOutcome.SnapBack -> Unit
                    }
                },
            )
        },
    ) {
        Column(
            modifier = Modifier
                .offset { IntOffset(0, liftOffset.value.roundToInt()) }
                .padding(bottom = MeeshySpacing.xl),
        ) {
            if (ctx.isActionable) {
                EmojiQuickStrip(
                    emojis = quickReactions,
                    ownReactions = ownReactions,
                    accentColor = accentColor,
                    onReact = onReact,
                    onExpand = onExpandPicker,
                    modifier = Modifier.padding(
                        horizontal = MeeshySpacing.lg,
                        vertical = MeeshySpacing.sm,
                    ),
                )
                HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)
            }

            // Interactive audio preview for a playable voice/audio attachment —
            // play/pause, scrubber, ±5s, tap-to-cycle speed — driven by the pure
            // [OverlayMediaTransport]. Mirrors iOS `PreviewAudioPlayer` in the overlay.
            bubble.audios.firstOrNull { it.isPlayable }?.let { audio ->
                OverlayMediaPreview(
                    audio = audio,
                    accentColor = accentColor,
                    modifier = Modifier.padding(
                        horizontal = MeeshySpacing.lg,
                        vertical = MeeshySpacing.sm,
                    ),
                )
                HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)
            }

            // The action grid is composed by the pure [MessageActionMenu] SSOT; this
            // block is a dumb renderer mapping each resolved action to its row.
            MessageActionMenu.actions(ctx).forEach { action ->
                when (action) {
                    MessageAction.Reply -> SheetAction(
                        icon = Icons.AutoMirrored.Filled.Reply,
                        label = stringResource(R.string.chat_action_reply),
                        onClick = onReply,
                    )
                    MessageAction.Forward -> SheetAction(
                        icon = Icons.AutoMirrored.Filled.Send,
                        label = stringResource(R.string.chat_action_forward),
                        onClick = onForward,
                    )
                    MessageAction.ShowOriginal -> SheetAction(
                        icon = Icons.Filled.Translate,
                        label = stringResource(R.string.chat_action_show_original),
                        onClick = onToggleOriginal,
                    )
                    MessageAction.ShowTranslation -> SheetAction(
                        icon = Icons.Filled.Translate,
                        label = stringResource(R.string.chat_action_show_translation),
                        onClick = onToggleOriginal,
                    )
                    MessageAction.ExploreLanguages -> SheetAction(
                        icon = Icons.Filled.Language,
                        label = stringResource(R.string.chat_action_explore_languages),
                        onClick = onExploreLanguages,
                    )
                    MessageAction.Copy -> SheetAction(
                        icon = Icons.Filled.ContentCopy,
                        label = stringResource(R.string.chat_action_copy),
                        onClick = {
                            clipboard.setText(AnnotatedString(bubble.text))
                            onDismiss()
                        },
                    )
                    MessageAction.OpenFile -> SheetAction(
                        icon = Icons.Filled.AttachFile,
                        label = stringResource(R.string.chat_action_open_file),
                        onClick = {
                            onOpenFile()
                            onDismiss()
                        },
                    )
                    MessageAction.ShareFile -> SheetAction(
                        icon = Icons.Filled.Share,
                        label = stringResource(R.string.chat_action_share_file),
                        onClick = {
                            onShareFile()
                            onDismiss()
                        },
                    )
                    MessageAction.Pin -> SheetAction(
                        icon = Icons.Filled.PushPin,
                        label = stringResource(R.string.chat_action_pin),
                        onClick = onPin,
                    )
                    MessageAction.Unpin -> SheetAction(
                        icon = Icons.Filled.PushPin,
                        label = stringResource(R.string.chat_action_unpin),
                        onClick = onPin,
                    )
                    MessageAction.Star -> SheetAction(
                        icon = Icons.Filled.BookmarkBorder,
                        label = stringResource(R.string.chat_action_star),
                        onClick = onStar,
                    )
                    MessageAction.Unstar -> SheetAction(
                        icon = Icons.Filled.Bookmark,
                        label = stringResource(R.string.chat_action_unstar),
                        onClick = onStar,
                    )
                    MessageAction.Edit -> SheetAction(
                        icon = Icons.Filled.Edit,
                        label = stringResource(R.string.chat_action_edit),
                        onClick = onEdit,
                    )
                    MessageAction.DeleteForEveryone -> SheetAction(
                        icon = Icons.Filled.Delete,
                        label = stringResource(R.string.chat_action_delete_for_everyone),
                        tint = MeeshyPalette.Error,
                        onClick = { confirmingDelete = true },
                    )
                    MessageAction.DeleteForMe -> SheetAction(
                        icon = Icons.Filled.Delete,
                        label = stringResource(R.string.chat_action_delete_for_me),
                        tint = MeeshyPalette.Error,
                        onClick = { confirmingDelete = true },
                    )
                    MessageAction.Views -> SheetAction(
                        icon = Icons.Filled.Visibility,
                        label = stringResource(R.string.chat_action_views),
                        onClick = { onViews(); onDismiss() },
                    )
                    MessageAction.History -> SheetAction(
                        icon = Icons.Filled.History,
                        label = stringResource(R.string.chat_action_history),
                        onClick = { onHistory(); onDismiss() },
                    )
                    MessageAction.Sentiment -> SheetAction(
                        icon = Icons.Filled.Mood,
                        label = stringResource(R.string.chat_action_sentiment),
                        onClick = { onSentiment(); onDismiss() },
                    )
                    MessageAction.Select -> SheetAction(
                        icon = Icons.Filled.CheckCircle,
                        label = stringResource(R.string.chat_action_select),
                        onClick = { onSelect(); onDismiss() },
                    )
                    MessageAction.ExportCard -> SheetAction(
                        icon = Icons.Filled.Image,
                        label = stringResource(R.string.chat_action_export_card),
                        onClick = { onExportCard(); onDismiss() },
                    )
                    MessageAction.Report -> SheetAction(
                        icon = Icons.Outlined.Flag,
                        label = stringResource(R.string.chat_action_report),
                        tint = MeeshyPalette.Error,
                        onClick = onReport,
                    )
                }
            }
        }
    }
    if (confirmingDelete) {
        MessageDeleteConfirmationDialog(
            scopes = MessageDeleteConfirmation.scopes(MessageActionMenu.actions(ctx)),
            onDeleteForEveryone = onDeleteForEveryone,
            onDeleteForMe = onDeleteForMe,
            onDismiss = { confirmingDelete = false },
        )
    }
}

/**
 * The grabber at the top of the long-press overlay sheet. Its vertical drag is
 * governed entirely by the pure [MessageOverlayDragLaw]: [onDrag] streams the
 * damped display offset while the finger moves, [onOutcome] fires the resolved
 * action on release (open "More…", dismiss, or snap back), and [onSettle] springs
 * the lift back to rest. The pill widens and takes the accent colour once the drag
 * arms the "More…" threshold ([MessageOverlayDragLaw.isArmed]) so the gesture reads
 * as intentional before release. All testable decisions live in the pure law; this
 * is coverage-exempt Compose glue.
 */
@Composable
private fun OverlayDragHandle(
    accentColor: Color,
    onDrag: (Float) -> Unit,
    onSettle: () -> Unit,
    onOutcome: (MessageOverlayDragOutcome) -> Unit,
) {
    var armed by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.md)
            .pointerInput(Unit) {
                val tracker = VelocityTracker()
                var accumulated = 0f
                detectVerticalDragGestures(
                    onDragStart = {
                        accumulated = 0f
                        armed = false
                        tracker.resetTracking()
                    },
                    onDragEnd = {
                        val velocityY = tracker.calculateVelocity().y
                        val predicted = accumulated + velocityY * OVERLAY_DRAG_VELOCITY_PROJECTION_SECONDS
                        val outcome = MessageOverlayDragLaw.outcome(accumulated, predicted)
                        armed = false
                        onSettle()
                        onOutcome(outcome)
                    },
                    onDragCancel = {
                        accumulated = 0f
                        armed = false
                        onSettle()
                    },
                    onVerticalDrag = { change, dragAmount ->
                        accumulated += dragAmount
                        tracker.addPosition(change.uptimeMillis, change.position)
                        val nowArmed = MessageOverlayDragLaw.isArmed(accumulated)
                        if (nowArmed != armed) armed = nowArmed
                        onDrag(accumulated)
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .width(if (armed) 48.dp else 32.dp)
                .height(4.dp)
                .clip(CircleShape)
                .background(if (armed) accentColor else MeeshyTheme.tokens.backgroundTertiary),
        )
    }
}

@Composable
private fun SheetAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    tint: Color = MeeshyTheme.tokens.textPrimary,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Text(text = label, style = MaterialTheme.typography.bodyLarge, color = tint)
    }
}
