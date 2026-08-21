package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The expanded attachment ladder — a horizontal carousel of circular gradient
 * tiles, one per [AttachmentTile] resolved by [ComposerAttachmentLadder]. Pure
 * glue: it renders whatever the resolver decided and calls back with the tapped
 * [AttachmentTileKind]; it holds no "which tile" logic of its own.
 *
 * Parity with iOS `UniversalComposerBar+Attachments.carouselTile` — the same
 * per-kind gradient (top-leading → bottom-trailing, base colour → 70% alpha) and
 * a label under each disc.
 */
@Composable
internal fun ComposerAttachmentTray(
    tiles: List<AttachmentTile>,
    onTileClick: (AttachmentTileKind) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        tiles.forEach { tile ->
            AttachmentTileButton(tile = tile, onClick = { onTileClick(tile.kind) })
        }
    }
}

@Composable
private fun AttachmentTileButton(
    tile: AttachmentTile,
    onClick: () -> Unit,
) {
    val label = stringResource(tile.kind.labelRes())
    val base = hexColor(tile.colorHex).takeIf { it != Color.Unspecified } ?: MeeshyTheme.tokens.textSecondary
    Column(
        modifier = Modifier.clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Column(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(listOf(base, base.copy(alpha = 0.7f))),
                ),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = tile.kind.icon(),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(24.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

private fun AttachmentTileKind.icon(): ImageVector = when (this) {
    AttachmentTileKind.Photo -> Icons.Filled.PhotoLibrary
    AttachmentTileKind.Camera -> Icons.Filled.PhotoCamera
    AttachmentTileKind.File -> Icons.AutoMirrored.Filled.InsertDriveFile
    AttachmentTileKind.Location -> Icons.Filled.LocationOn
    AttachmentTileKind.Voice -> Icons.Filled.Mic
    AttachmentTileKind.Emoji -> Icons.Filled.EmojiEmotions
}

private fun AttachmentTileKind.labelRes(): Int = when (this) {
    AttachmentTileKind.Photo -> R.string.composer_attach_photo
    AttachmentTileKind.Camera -> R.string.composer_attach_camera
    AttachmentTileKind.File -> R.string.composer_attach_file_tile
    AttachmentTileKind.Location -> R.string.composer_attach_location
    AttachmentTileKind.Voice -> R.string.composer_attach_voice
    AttachmentTileKind.Emoji -> R.string.composer_attach_emoji
}
