package me.meeshy.app.profile

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.util.Date
import kotlinx.coroutines.delay
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.ProfileWhereStamp
import me.meeshy.ui.component.location.MapCenterPin
import me.meeshy.ui.component.location.TileMapView
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

internal const val PROFILE_WHERE_HERO_TAG = "profile.where.hero"

private val HERO_HEIGHT = 200.dp
private const val HERO_ZOOM = 15
private const val CLOCK_TICK_MS = 30_000L

/**
 * LE BLOC HÉROS DE CARTE d'une fiche (#20242, iso `ProfileWhereHero.swift`) : la carte pleine largeur centrée sur la
 * DERNIÈRE position connue, le lieu (ou le nom) et l'heure de cette position posés sur un voile en bas ; un toucher ouvre
 * la carte. L'hôte ne le pose que s'il a une position : jamais de carte vide.
 */
@Composable
internal fun ProfileWhereHero(
    title: String,
    point: GeoPoint,
    atMillis: Long?,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val now by rememberHeroClock()
    val stamp = atMillis?.let { ProfileWhereStamp.of(it, now) }
    val caption = profileWhereCaption(stamp)
    val openLabel = stringResource(R.string.location_map_open)
    val shape = RoundedCornerShape(MeeshyRadius.xl)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(HERO_HEIGHT)
            .clip(shape)
            .clickable(onClick = onTap)
            .testTag(PROFILE_WHERE_HERO_TAG)
            .clearAndSetSemantics {
                contentDescription = "$title, $caption"
                role = Role.Button
                onClick(label = openLabel) {
                    onTap()
                    true
                }
            },
    ) {
        TileMapView(
            center = point,
            zoom = HERO_ZOOM,
            markers = listOf(point),
            marker = { MapCenterPin(lifted = false, color = MaterialTheme.colorScheme.primary) },
            showAttribution = false,
            modifier = Modifier.fillMaxSize(),
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.62f))))
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = caption,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.9f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** « Dernière position · il y a 7 min » ; sans heure connue, « Dernière position » seul. */
@Composable
internal fun profileWhereCaption(stamp: ProfileWhereStamp?): String {
    val lead = stringResource(R.string.profile_where_hero_last_known)
    val tail = stamp?.let { profileWhereStampText(it) } ?: return lead
    return "$lead · $tail"
}

@Composable
private fun profileWhereStampText(stamp: ProfileWhereStamp): String {
    val context = LocalContext.current
    return when (stamp) {
        ProfileWhereStamp.JustNow -> stringResource(R.string.profile_where_stamp_just_now)
        is ProfileWhereStamp.MinutesAgo -> stringResource(R.string.profile_where_stamp_minutes, stamp.minutes)
        is ProfileWhereStamp.At -> {
            val date = Date(stamp.epochMillis)
            val time = DateFormat.getTimeFormat(context).format(date)
            val shown = if (stamp.sameDay) time else "${DateFormat.getMediumDateFormat(context).format(date)} $time"
            stringResource(R.string.profile_where_stamp_at, shown)
        }
    }
}

/** L'horloge du bloc : « il y a N min » vieillit tant que la fiche est à l'écran. */
@Composable
private fun rememberHeroClock(): State<Long> = produceState(initialValue = System.currentTimeMillis()) {
    while (true) {
        delay(CLOCK_TICK_MS)
        value = System.currentTimeMillis()
    }
}
