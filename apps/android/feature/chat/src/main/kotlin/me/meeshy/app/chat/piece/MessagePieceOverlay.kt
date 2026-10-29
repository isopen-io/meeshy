package me.meeshy.app.chat.piece

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.piece.MessagePieceTarget
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'appui long sur une tuile montre CETTE pièce seule, avec le défilement vers les autres pièces du message (directive
 * porteur 2026-10-10, miroir de `MessagePieceOverlay`, iOS) : la pièce s'ouvre à SON ratio, un balayage mène aux autres
 * avec « 3/7 », le menu agit sur la pièce AFFICHÉE, et « Tout le message » rend l'aperçu du message entier. Une pièce
 * protégée se montre masquée et ne charge aucun pixel : l'appui long ne dévoile pas ce que le fil retient.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun MessagePieceOverlay(
    model: PieceOverlayModel,
    accent: Color,
    onReply: () -> Unit,
    onWholeMessage: () -> Unit,
    onDismiss: () -> Unit,
    onSave: (attachmentId: String) -> Unit = {},
    onForward: (attachmentId: String) -> Unit = {},
    onCopy: (attachmentId: String) -> Unit = {},
    onDelete: (attachmentId: String) -> Unit = {},
    quickReactions: List<String> = emptyList(),
    onReact: (attachmentId: String, emoji: String) -> Unit = { _, _ -> },
) {
    val haptics = rememberMeeshyHaptics()
    var pendingDelete by remember { mutableStateOf<String?>(null) }
    val pager = rememberPagerState(initialPage = model.startIndex) { model.pages.size }
    val index = pager.currentPage.coerceIn(0, model.pages.lastIndex)
    val actions = remember(model, index) { model.actionsFor(index) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MeeshyMediaChromeColors.ScrimStrong)
                .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }, onClick = onDismiss)
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (quickReactions.isNotEmpty() && model.offersReaction(index)) {
                EmojiQuickStrip(
                    emojis = quickReactions,
                    ownReactions = model.pages[index].ownReactions,
                    accentColor = accent,
                    onReact = { emoji ->
                        onReact(model.pages[index].attachmentId, emoji)
                        onDismiss()
                    },
                    modifier = Modifier.clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {},
                )
            }
            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(min = 160.dp)) {
                val stageWidth = maxWidth.coerceAtMost(440.dp)
                val stageHeight = maxHeight
                HorizontalPager(state = pager, modifier = Modifier.fillMaxWidth(), pageSpacing = MeeshySpacing.md) { page ->
                    val piece = model.pages[page]
                    val fitted = MessagePieceTarget.fittedSize(piece.ratio, stageWidth.value, stageHeight.value)
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        PiecePageView(piece, page, model.pages.size, accent, Modifier.size(fitted.width.dp, fitted.height.dp))
                    }
                }
            }
            if (model.pages.size > 1) PositionChip(MessagePieceTarget.position(index, model.pages.size))
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.8f)
                    .clip(RoundedCornerShape(MeeshyRadius.lg))
                    .background(MeeshyTheme.tokens.backgroundPrimary)
                    .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {},
            ) {
                actions.forEach { action ->
                    PieceActionRow(action, accent) {
                        haptics.light()
                        when (action) {
                            MessagePieceTarget.Action.REPLY -> { onReply(); onDismiss() }
                            MessagePieceTarget.Action.SAVE -> { onSave(model.pages[index].attachmentId); onDismiss() }
                            MessagePieceTarget.Action.FORWARD -> { onForward(model.pages[index].attachmentId); onDismiss() }
                            MessagePieceTarget.Action.COPY -> { onCopy(model.pages[index].attachmentId); onDismiss() }
                            MessagePieceTarget.Action.DELETE -> pendingDelete = model.pages[index].attachmentId
                            MessagePieceTarget.Action.WHOLE_MESSAGE -> { onDismiss(); onWholeMessage() }
                        }
                    }
                }
            }
        }
        pendingDelete?.let { attachmentId ->
            AlertDialog(
                onDismissRequest = { pendingDelete = null },
                title = { Text(stringResource(R.string.piece_delete_confirm_title)) },
                confirmButton = {
                    TextButton(onClick = { pendingDelete = null; onDelete(attachmentId); onDismiss() }) {
                        Text(stringResource(R.string.piece_delete_confirm_action), color = MeeshyTheme.tokens.error)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { pendingDelete = null }) { Text(stringResource(R.string.common_cancel)) }
                },
            )
        }
    }
}

@Composable
private fun PiecePageView(piece: PiecePage, page: Int, count: Int, accent: Color, modifier: Modifier) {
    val spoken = if (piece.isVideo) stringResource(R.string.piece_a11y_video, page + 1, count) else stringResource(R.string.piece_a11y_photo, page + 1, count)
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(accent.copy(alpha = 0.25f))
            .semantics { contentDescription = piece.alt?.let { "$spoken, $it" } ?: spoken },
        contentAlignment = Alignment.Center,
    ) {
        if (piece.isProtected) {
            Icon(MeeshyIcons.LockFilled, null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(40.dp))
        } else {
            AsyncImage(model = piece.url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
            if (piece.isVideo) {
                Icon(MeeshyIcons.Video, null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(48.dp))
            }
        }
    }
}

@Composable
private fun PositionChip(text: String) {
    Text(
        text,
        color = MeeshyMediaChromeColors.OnMedia,
        fontSize = MeeshyFontSize.small,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(CircleShape)
            .background(MeeshyMediaChromeColors.MediaFill)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .clearAndSetSemantics {},
    )
}

@Composable
private fun PieceActionRow(action: MessagePieceTarget.Action, accent: Color, onClick: () -> Unit) {
    val label = when (action) {
        MessagePieceTarget.Action.REPLY -> stringResource(R.string.chat_action_reply)
        MessagePieceTarget.Action.FORWARD -> stringResource(R.string.chat_action_forward)
        MessagePieceTarget.Action.SAVE -> stringResource(R.string.piece_action_save)
        MessagePieceTarget.Action.COPY -> stringResource(R.string.chat_action_copy)
        MessagePieceTarget.Action.DELETE -> stringResource(R.string.piece_action_delete)
        MessagePieceTarget.Action.WHOLE_MESSAGE -> stringResource(R.string.piece_whole_message)
    }
    val tint = if (action == MessagePieceTarget.Action.DELETE) MeeshyTheme.tokens.error else accent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(pieceActionIcon(action), null, tint = tint, modifier = Modifier.size(20.dp))
        Text(label, color = if (action == MessagePieceTarget.Action.DELETE) tint else MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.body)
    }
}

private fun pieceActionIcon(action: MessagePieceTarget.Action) = when (action) {
    MessagePieceTarget.Action.REPLY -> MeeshyIcons.Reply
    MessagePieceTarget.Action.FORWARD -> MeeshyIcons.ForwardMessage
    MessagePieceTarget.Action.SAVE -> MeeshyIcons.Download
    MessagePieceTarget.Action.COPY -> MeeshyIcons.Copy
    MessagePieceTarget.Action.DELETE -> MeeshyIcons.Delete
    MessagePieceTarget.Action.WHOLE_MESSAGE -> MeeshyIcons.Article
}
