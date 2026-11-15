package me.meeshy.app.chat.share

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.share.ShareIncomingStrip
import me.meeshy.sdk.model.share.ShareIncomingTile
import me.meeshy.sdk.model.share.ShareMedia
import me.meeshy.sdk.model.share.SharePieceKind
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val ShareIncomingTileTestTag = "share-incoming-tile"
internal const val ShareIncomingRemoveTestTag = "share-incoming-remove"

internal data class ShareIncomingStripActions(
    val onRemove: (key: String) -> Unit,
    /** -1 = Avancer (plus tôt), +1 = Reculer (plus tard). */
    val onMove: (key: String, offset: Int) -> Unit,
)

/**
 * **« Ce qui part » quand une autre app remet des fichiers** (iOS `ShareIncomingStrip`) — vignettes
 * paresseuses (un partage porte jusqu'à 100 pièces), numérotées dans l'ordre d'envoi, croix pour retirer ;
 * « Avancer » et « Reculer » réordonnent sans glisser (actions TalkBack). Une pièce au-delà des plafonds est
 * atténuée, cerclée d'erreur et dite « dépasse la limite ».
 */
@Composable
internal fun ShareIncomingStripView(
    media: List<ShareMedia>,
    fittingCount: Int,
    accentColor: Color,
    thumbnailLoader: ShareThumbnailLoader,
    actions: ShareIncomingStripActions,
    modifier: Modifier = Modifier,
) {
    val tiles = remember(media, fittingCount) { ShareIncomingStrip.tiles(media, fittingCount) }
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        itemsIndexed(tiles, key = { _, tile -> tile.key }, contentType = { _, _ -> "incoming-tile" }) { index, tile ->
            IncomingTile(tile, media[index], accentColor, thumbnailLoader, actions)
        }
    }
}

@Composable
private fun IncomingTile(
    tile: ShareIncomingTile,
    media: ShareMedia,
    accentColor: Color,
    thumbnailLoader: ShareThumbnailLoader,
    actions: ShareIncomingStripActions,
) {
    val kindLabel = stringResource(kindLabelRes(tile.kind))
    val spoken = buildString {
        append(stringResource(R.string.share_content_piece_number, tile.number)).append(", ").append(kindLabel)
        if (tile.isOverLimit) append(", ").append(stringResource(R.string.share_content_over_limit))
    }
    val forward = stringResource(R.string.share_content_move_forward)
    val backward = stringResource(R.string.share_content_move_backward)
    val remove = stringResource(R.string.share_content_remove)
    val customActions = buildList {
        if (tile.canMoveForward) add(CustomAccessibilityAction(forward) { actions.onMove(tile.key, -1); true })
        if (tile.canMoveBackward) add(CustomAccessibilityAction(backward) { actions.onMove(tile.key, 1); true })
        if (tile.removable) add(CustomAccessibilityAction(remove) { actions.onRemove(tile.key); true })
    }
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    val errorColor = MeeshyTheme.tokens.error
    Box(
        modifier = Modifier
            .testTag(ShareIncomingTileTestTag)
            .semantics(mergeDescendants = true) {
                contentDescription = spoken
                this.customActions = customActions
            },
    ) {
        Box(
            modifier = Modifier
                .padding(top = MeeshySpacing.xs, end = MeeshySpacing.xs)
                .size(72.dp)
                .alpha(if (tile.isOverLimit) 0.6f else 1f)
                .clip(shape)
                .background(accentColor.copy(alpha = 0.12f))
                .then(if (tile.isOverLimit) Modifier.border(2.dp, errorColor, shape) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            val bitmap = rememberThumbnail(media, thumbnailLoader)
            if (bitmap != null) {
                Image(bitmap, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(72.dp))
            } else {
                Icon(kindIcon(tile.kind), contentDescription = null, tint = accentColor)
            }
            Text(
                text = tile.number.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(MeeshySpacing.xxs)
                    .background(Color.Black.copy(alpha = 0.55f), CircleShape)
                    .padding(horizontal = MeeshySpacing.xs),
            )
        }
        if (tile.removable) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable { actions.onRemove(tile.key) }
                    .testTag(ShareIncomingRemoveTestTag)
                    .clearAndSetSemantics { },
                contentAlignment = Alignment.TopEnd,
            ) {
                Icon(
                    MeeshyIcons.CloseCircleFilled,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp).background(Color.Black.copy(alpha = 0.6f), CircleShape),
                )
            }
        }
    }
}

@Composable
private fun rememberThumbnail(media: ShareMedia, loader: ShareThumbnailLoader): ImageBitmap? {
    var bitmap by remember(media.id, media.mimeType) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(media.id, media.mimeType) {
        bitmap = loader(media, ShareIncomingStrip.THUMBNAIL_MAX_PIXELS)
    }
    return bitmap
}

internal fun kindLabelRes(kind: SharePieceKind): Int = when (kind) {
    SharePieceKind.IMAGE -> R.string.forward_preview_image
    SharePieceKind.VIDEO -> R.string.forward_preview_video
    SharePieceKind.AUDIO -> R.string.forward_preview_audio
    SharePieceKind.FILE -> R.string.forward_preview_file
}

internal fun kindIcon(kind: SharePieceKind) = when (kind) {
    SharePieceKind.IMAGE -> MeeshyIcons.PhotoFilled
    SharePieceKind.VIDEO -> MeeshyIcons.Video
    SharePieceKind.AUDIO -> MeeshyIcons.Waveform
    SharePieceKind.FILE -> MeeshyIcons.Document
}
