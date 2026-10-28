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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
) {
    val haptics = rememberMeeshyHaptics()
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
                            MessagePieceTarget.Action.WHOLE_MESSAGE -> { onDismiss(); onWholeMessage() }
                        }
                    }
                }
            }
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
        MessagePieceTarget.Action.WHOLE_MESSAGE -> stringResource(R.string.piece_whole_message)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            if (action == MessagePieceTarget.Action.REPLY) MeeshyIcons.Reply else MeeshyIcons.Article,
            null, tint = accent, modifier = Modifier.size(20.dp),
        )
        Text(label, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.body)
    }
}
