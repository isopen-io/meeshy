package me.meeshy.app.chat

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val PREVIEW_MAX_HEIGHT = 360.dp

/**
 * Long-press quick look of a recent-media cell, with its three actions — port of iOS
 * `RecentMediaPreview` + the cell's context menu (Ajouter / Sélectionner / Éditer).
 * A photo renders full quality; a video shows its poster then plays looping WITH
 * sound. Éditer only appears when the host wired an editor flow ([canEdit]).
 */
@Composable
internal fun RecentMediaPreviewDialog(
    item: RecentMediaItem,
    poster: Bitmap?,
    accentColor: Color,
    isAttached: Boolean,
    isSelected: Boolean,
    canEdit: Boolean,
    onAdd: () -> Unit,
    onToggleSelect: () -> Unit,
    onEdit: () -> Unit,
    onDismiss: () -> Unit,
) {
    val ratio = if (item.width > 0 && item.height > 0) item.width.toFloat() / item.height else 1f
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .heightIn(max = PREVIEW_MAX_HEIGHT)
                    .aspectRatio(ratio.coerceIn(0.4f, 2.5f))
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(Color.Black.copy(alpha = 0.05f)),
            ) {
                if (item.isVideo) {
                    PreviewPoster(poster)
                    ReelVideoSurface(
                        mediaUrl = item.uri.toString(),
                        isActive = true,
                        modifier = Modifier.fillMaxSize(),
                        muted = false,
                    )
                } else {
                    AsyncImage(
                        model = item.uri,
                        contentDescription = null,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.matchParentSize(),
                    )
                }
            }
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(MeeshyTheme.tokens.backgroundPrimary)
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                PreviewAction(Icons.Filled.AddCircle, stringResource(R.string.composer_recent_add), accentColor, !isAttached, onAdd)
                PreviewAction(
                    Icons.Filled.CheckCircle,
                    stringResource(R.string.composer_recent_select),
                    if (isSelected) accentColor else MeeshyTheme.tokens.textSecondary,
                    !isAttached,
                    onToggleSelect,
                )
                if (canEdit) {
                    PreviewAction(Icons.Filled.Edit, stringResource(R.string.composer_recent_edit), accentColor, true, onEdit)
                }
            }
        }
    }
}

@Composable
private fun PreviewPoster(poster: Bitmap?) {
    if (poster == null) return
    Image(
        bitmap = poster.asImageBitmap(),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
private fun PreviewAction(icon: ImageVector, label: String, tint: Color, enabled: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(icon, contentDescription = null, tint = if (enabled) tint else tint.copy(alpha = 0.4f), modifier = Modifier.size(20.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textSecondary,
        )
    }
}
