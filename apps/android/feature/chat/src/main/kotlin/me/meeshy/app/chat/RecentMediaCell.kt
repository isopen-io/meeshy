package me.meeshy.app.chat

import android.graphics.Bitmap
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val SELECTION_BADGE_SIZE = 22.dp
private const val ATTACHED_ALPHA = 0.45f
private const val RESOLVING_SCRIM = 0.35f

/**
 * One cell of the recent-media grid — port of iOS `RecentMediaCell`: square thumbnail
 * (placeholder until it resolves), video duration over a bottom gradient, then ONE of
 * the attached badge (veiled tile + check) or the selection badge (hollow circle, or
 * accent disc carrying the 1-based pick order) while selecting, and a scrim + spinner
 * while the asset resolves. [accentColor] is the conversation accent, passed in.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun RecentMediaCell(
    item: RecentMediaItem,
    thumbnails: RecentMediaThumbnails,
    pixelSide: Int,
    accentColor: Color,
    isResolving: Boolean,
    isAttached: Boolean,
    isSelecting: Boolean,
    selectionPosition: Int?,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val thumbnail by produceState<Bitmap?>(thumbnails.peek(item, pixelSide), item.id, pixelSide) {
        value = thumbnails.load(item, pixelSide)
    }
    val shape = RoundedCornerShape(MeeshyRadius.smPlus)
    val label = stringResource(if (item.isVideo) R.string.composer_a11y_recentVideo else R.string.composer_a11y_recentPhoto)
    val attachedLabel = stringResource(R.string.composer_recent_alreadyAttached)
    val selectedLabel = stringResource(R.string.composer_a11y_selectedState)
    val state = when {
        isAttached -> attachedLabel
        selectionPosition != null -> selectedLabel
        else -> ""
    }
    Box(
        modifier = modifier
            .clip(shape)
            .alpha(if (isAttached) ATTACHED_ALPHA else 1f)
            .border(if (selectionPosition != null) 2.dp else 0.dp, accentColor, shape)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                stateDescription = state
                role = Role.Button
            },
    ) {
        val bitmap = thumbnail
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(Modifier.fillMaxSize().background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.18f)))
        }
        if (item.isVideo) DurationOverlay(item.durationMs, Modifier.align(Alignment.BottomStart))
        when {
            isAttached -> AttachedBadge(accentColor, Modifier.align(Alignment.TopEnd))
            isSelecting -> SelectionBadge(selectionPosition, accentColor, Modifier.align(Alignment.TopEnd))
        }
        if (isResolving) {
            Box(
                Modifier.fillMaxSize().background(Color.Black.copy(alpha = RESOLVING_SCRIM)),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
private fun DurationOverlay(durationMs: Long, modifier: Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.5f))))
            .padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xxs)
            .clearAndSetSemantics { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Icon(Icons.Filled.Videocam, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
        Text(
            text = formatClock(durationMs),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
        )
    }
}

@Composable
private fun AttachedBadge(accentColor: Color, modifier: Modifier) {
    Box(modifier.padding(MeeshySpacing.xs).clearAndSetSemantics { }) {
        Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White).align(Alignment.Center))
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(SELECTION_BADGE_SIZE),
        )
    }
}

@Composable
private fun SelectionBadge(position: Int?, accentColor: Color, modifier: Modifier) {
    val fill = if (position != null) accentColor else Color.Black.copy(alpha = 0.25f)
    Box(
        modifier = modifier
            .padding(MeeshySpacing.xs)
            .size(SELECTION_BADGE_SIZE)
            .clip(CircleShape)
            .background(fill)
            .border(2.dp, Color.White, CircleShape)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        if (position != null) {
            Text(
                text = position.toString(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

/** `m:ss`, the clock a video duration reads in under its thumbnail. */
internal fun formatClock(durationMs: Long): String {
    val totalSeconds = (durationMs.coerceAtLeast(0L) / 1000L).toInt()
    return "%d:%02d".format(totalSeconds / 60, totalSeconds % 60)
}
