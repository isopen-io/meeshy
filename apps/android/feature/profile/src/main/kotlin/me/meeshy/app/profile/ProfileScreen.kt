package me.meeshy.app.profile

import me.meeshy.ui.icons.MeeshyIcons
import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Article
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.format.RelativeTimeLongText
import me.meeshy.ui.component.ProfileCompletionRing
import me.meeshy.ui.format.rememberRelativeTimeLongStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.DateFormat
import java.time.ZoneId
import java.util.Date
import java.util.Locale

/*
 * Les briques COMMUNES aux pages de profil, MA page ([OwnProfileScreen]) et la feuille d'une
 * personne : postes, statistiques, activite. Chaque brique est une projection sans etat de
 * ses arguments.
 */

/** A tappable row leading to this user's authored-posts feed. */
@Composable
internal fun ProfilePostsRow(onClick: () -> Unit) {
    Spacer(Modifier.height(MeeshySpacing.md))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshySpacing.sm))
            .clickable(onClick = onClick)
            .padding(vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Article,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.profile_view_posts),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(20.dp),
        )
    }
}

/** The read-only activity stats dashboard — counter tiles + achievement badges. */
@Composable
internal fun ProfileStatsSection(stats: UserStatsPresentation) {
    if (stats.tiles.isEmpty()) return
    Spacer(Modifier.height(MeeshySpacing.md))
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.profile_stats_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        stats.tiles.chunked(2).forEach { rowTiles ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                rowTiles.forEach { tile ->
                    StatTileView(tile, modifier = Modifier.weight(1f))
                }
                if (rowTiles.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        if (stats.badges.isNotEmpty()) {
            Spacer(Modifier.height(MeeshySpacing.xs))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.profile_achievements_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                Text(
                    text = stringResource(
                        R.string.profile_achievements_unlocked,
                        stats.unlockedCount,
                        stats.totalCount,
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
            stats.badges.forEach { AchievementBadgeView(it) }
        }
    }
}

/** The read-only 30-day activity sparkline — accent-coherent line + area chart. */
@Composable
internal fun ProfileTimelineSection(timeline: StatsTimelinePresentation) {
    if (timeline.bars.isEmpty()) return
    val accent = MeeshyPalette.Indigo500
    Spacer(Modifier.height(MeeshySpacing.md))
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.profile_activity_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.profile_activity_average, timeline.averagePerDay),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        if (timeline.hasActivity) {
            ActivitySparkline(
                bars = timeline.bars,
                color = accent,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp),
            )
        } else {
            Text(
                text = stringResource(R.string.profile_activity_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

/**
 * A fixed-height sparkline over the per-day normalized activity. Draws a subtle
 * top-to-bottom area fill under an accent line. Pure rendering — every decision
 * (normalization, ordering, activity gating) is made upstream in
 * [StatsTimelineBuilder], so this Composable only maps `0f..1f` heights to pixels.
 */
@Composable
internal fun ActivitySparkline(
    bars: List<TimelineBar>,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val count = bars.size
        val stepX = if (count > 1) size.width / (count - 1) else 0f
        val usableHeight = size.height - 4.dp.toPx()

        fun pointAt(index: Int): Offset {
            val x = if (count > 1) stepX * index else size.width / 2f
            val y = 2.dp.toPx() + usableHeight * (1f - bars[index].normalized)
            return Offset(x, y)
        }

        val linePath = Path().apply {
            moveTo(pointAt(0).x, pointAt(0).y)
            for (i in 1 until count) lineTo(pointAt(i).x, pointAt(i).y)
        }
        val areaPath = Path().apply {
            addPath(linePath)
            lineTo(pointAt(count - 1).x, size.height)
            lineTo(pointAt(0).x, size.height)
            close()
        }

        drawPath(
            path = areaPath,
            brush = Brush.verticalGradient(
                colors = listOf(color.copy(alpha = 0.28f), color.copy(alpha = 0f)),
            ),
        )
        drawPath(
            path = linePath,
            color = color,
            style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
        )
    }
}

@Composable
private fun StatTileView(tile: StatTile, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MeeshyTheme.tokens.backgroundTertiary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(MeeshySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = tile.formattedValue,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(statMetricLabel(tile.metric)),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun AchievementBadgeView(badge: AchievementBadge) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = badge.name,
            style = MaterialTheme.typography.bodyMedium,
            color = if (badge.isUnlocked) MeeshyTheme.tokens.textPrimary
            else MeeshyTheme.tokens.textSecondary,
            fontWeight = if (badge.isUnlocked) FontWeight.SemiBold else FontWeight.Normal,
        )
        Text(
            text = "${badge.progressPercent}%",
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

private fun statMetricLabel(metric: StatMetric): Int = when (metric) {
    StatMetric.MESSAGES -> R.string.profile_stat_messages
    StatMetric.CONVERSATIONS -> R.string.profile_stat_conversations
    StatMetric.TRANSLATIONS -> R.string.profile_stat_translations
    StatMetric.FRIEND_REQUESTS -> R.string.profile_stat_friend_requests
    StatMetric.LANGUAGES -> R.string.profile_stat_languages
    StatMetric.MEMBER_DAYS -> R.string.profile_stat_member_days
}

/** Localized medium-date label for the "member since" line. */
internal fun formatMemberSince(epochMillis: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(epochMillis))

/** Maps an [ImageUploadError] to the user-facing string shown in the snackbar. */
internal fun ImageUploadError.messageRes(): Int = when (this) {
    ImageUploadError.EMPTY -> R.string.profile_image_error_empty
    ImageUploadError.UNSUPPORTED_TYPE -> R.string.profile_image_error_type
    ImageUploadError.TOO_LARGE -> R.string.profile_image_error_too_large
    ImageUploadError.UPLOAD_FAILED -> R.string.profile_image_error_upload
    ImageUploadError.UPDATE_FAILED -> R.string.profile_image_error_update
}

private fun ContentResolver.displayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()
