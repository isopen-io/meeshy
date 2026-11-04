package me.meeshy.app.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.io.File
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.AttachmentTilePresentation
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.composer.TileFace
import me.meeshy.sdk.model.composer.TileTapAction
import me.meeshy.sdk.model.composer.TrayEntry
import me.meeshy.sdk.model.composer.TrayEntryKind
import me.meeshy.ui.component.composer.PieceRemoveBadge
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val TILE_SIDE = 56.dp
private val LABEL_WIDTH = 60.dp

/**
 * Une case du plateau : tuile 56 dp, badge de retrait à cheval sur le coin (#15229), libellé dessous. Miroir de
 * `ComposerAttachmentTile` / `ComposerPlaceTile` iOS. Une pièce en préparation montre sa progression et
 * « Annuler » ; le toucher édite (glyphe central) ou aperçoit selon [AttachmentTilePresentation].
 */
@Composable
internal fun ComposerAttachmentTile(
    entry: TrayEntry,
    accent: Color,
    onRemove: () -> Unit,
    onEdit: (() -> Unit)?,
    onPreview: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val kindLabel = stringResource(entry.kind.typeLabelRes(entry))
    val name = entry.label ?: kindLabel
    val a11y = stringResource(R.string.composer_tray_item_a11y, entry.position, entry.total, kindLabel, name)
    val removeLabel = stringResource(R.string.composer_tray_remove_action)
    Column(
        modifier = modifier
            .width(LABEL_WIDTH)
            .semantics(mergeDescendants = false) {
                contentDescription = a11y
                customActions = listOf(CustomAccessibilityAction(removeLabel) { onRemove(); true })
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(modifier = Modifier.size(TILE_SIDE)) {
            val item = entry.item
            when (entry.kind) {
                TrayEntryKind.PREPARING -> PreparingFace(name, onCancel = onRemove)
                TrayEntryKind.PLACE -> PlaceFace()
                TrayEntryKind.READY -> if (item != null) {
                    ReadyFace(AttachmentTilePresentation.of(item, editorAvailable = onEdit != null), accent, onEdit, onPreview)
                }
            }
            PieceRemoveBadge(
                label = stringResource(R.string.chat_tray_remove, name),
                onClick = onRemove,
                discColor = MeeshyTheme.tokens.error,
                discSize = 18.dp,
                glyphSize = 10.dp,
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
        Text(
            text = entry.label ?: kindLabel,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

private fun TrayEntryKind.typeLabelRes(entry: TrayEntry): Int = when (this) {
    TrayEntryKind.PLACE -> R.string.composer_tray_type_place
    else -> when (entry.item?.type) {
        PendingAttachmentType.IMAGE -> R.string.composer_tray_type_image
        PendingAttachmentType.VIDEO -> R.string.composer_tray_type_video
        PendingAttachmentType.AUDIO -> R.string.composer_tray_type_audio
        else -> R.string.composer_tray_type_file
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReadyFace(presentation: AttachmentTilePresentation, accent: Color, onEdit: (() -> Unit)?, onPreview: () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    val edits = presentation.tapAction == TileTapAction.EDIT && onEdit != null
    val tap = if (edits) onEdit!! else onPreview
    val previewLabel = stringResource(R.string.composer_tray_preview)
    val tapLabel = stringResource(if (edits) R.string.composer_tray_edit else R.string.composer_tray_preview)
    Box(
        modifier = Modifier
            .size(TILE_SIDE)
            .clip(shape)
            .combinedClickable(onClickLabel = tapLabel, role = Role.Button, onLongClickLabel = previewLabel, onLongClick = onPreview, onClick = tap),
        contentAlignment = Alignment.Center,
    ) {
        when (val face = presentation.face) {
            is TileFace.Thumbnail -> AsyncImage(
                model = File(face.path),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(TILE_SIDE),
            )
            TileFace.Waveform -> TintedFace(accent) { WaveformArt() }
            is TileFace.TypeGlyph -> TintedFace(accent) {
                Icon(face.type.glyph(), contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
        }
        if (presentation.showsEditGlyph) {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(MeeshyMediaChromeColors.Scrim),
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.EditFilled, contentDescription = null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(12.dp))
            }
        }
    }
}

@Composable
private fun TintedFace(tint: Color, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .size(TILE_SIDE)
            .background(Brush.linearGradient(listOf(tint, tint.copy(alpha = 0.7f)))),
        contentAlignment = Alignment.Center,
    ) { content() }
}

private val WAVE_BARS = listOf(0.3f, 0.8f, 0.5f, 1.0f, 0.4f, 0.9f, 0.6f)

@Composable
private fun WaveformArt() {
    Row(
        modifier = Modifier.size(width = 24.dp, height = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(1.5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WAVE_BARS.forEach { h ->
            Box(
                Modifier
                    .width(2.dp)
                    .size(width = 2.dp, height = (4 + 14 * h).dp)
                    .clip(RoundedCornerShape(1.dp))
                    .background(Color.White.copy(alpha = 0.7f)),
            )
        }
    }
}

@Composable
private fun PreparingFace(name: String, onCancel: () -> Unit) {
    val preparing = stringResource(R.string.chat_tray_preparing, name)
    val cancel = stringResource(R.string.composer_tray_cancel_preparing, name)
    Box(
        modifier = Modifier
            .size(TILE_SIDE)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyTheme.tokens.backgroundTertiary)
            .clickable(onClickLabel = cancel, role = Role.Button, onClick = onCancel)
            .semantics { contentDescription = preparing },
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
    }
}

@Composable
private fun PlaceFace() {
    val success = MeeshyTheme.tokens.success
    Box(
        modifier = Modifier
            .size(TILE_SIDE)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(Brush.linearGradient(listOf(success, success.copy(alpha = 0.7f)))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.LocationFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
    }
}

private fun PendingAttachmentType.glyph(): ImageVector = when (this) {
    PendingAttachmentType.VIDEO -> MeeshyIcons.PlayCircleFilled
    PendingAttachmentType.AUDIO -> MeeshyIcons.AccountFilled
    else -> MeeshyIcons.InsertFile
}
