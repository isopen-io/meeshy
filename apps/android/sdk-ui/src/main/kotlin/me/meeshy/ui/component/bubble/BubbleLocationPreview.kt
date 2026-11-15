package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.PlaceLabels
import me.meeshy.ui.R
import me.meeshy.ui.component.location.MapCenterPin
import me.meeshy.ui.component.location.TileMapView
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val CARD_WIDTH = 260.dp
private val MAP_HEIGHT = 150.dp
private val INFO_BAR_HEIGHT = 44.dp
private const val THUMBNAIL_ZOOM = 15

/**
 * Carte d'un lieu partagé dans la bulle — Android de `LocationMessageView` : un aperçu de carte
 * de hauteur FIXE (la cellule du fil n'est mesurée qu'une fois, avant que la moindre tuile
 * n'arrive), le pin posé sur le point, puis une barre nom / adresse. Toucher la carte l'ouvre
 * en plein écran (l'hôte décide). Un lieu sans coordonnées garde la barre seule, sans carte.
 */
@Composable
internal fun LocationPreview(
    location: BubbleLocation,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val openLabel = stringResource(R.string.bubble_location_open)
    val (title, subtitle) = PlaceLabels.infoLines(location.placeName, location.address)
    val shownTitle = title ?: stringResource(R.string.bubble_location_shared)
    val a11y = stringResource(R.string.location_a11y_label, shownTitle)
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Column(
        modifier = modifier
            .widthIn(max = CARD_WIDTH)
            .fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.95f))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = a11y
                }
            },
    ) {
        val lat = location.latitude
        val lon = location.longitude
        if (lat != null && lon != null) {
            val point = GeoPoint(lat, lon)
            TileMapView(
                center = point,
                zoom = THUMBNAIL_ZOOM,
                markers = listOf(point),
                marker = { MapCenterPin(lifted = false, color = MaterialTheme.colorScheme.primary) },
                modifier = Modifier.fillMaxWidth().height(MAP_HEIGHT),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().height(INFO_BAR_HEIGHT).padding(start = MeeshySpacing.smPlus),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = shownTitle,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (onClick != null) {
                Box(Modifier.size(INFO_BAR_HEIGHT), contentAlignment = Alignment.Center) {
                    Icon(
                        MeeshyIcons.ArrowUpRight,
                        contentDescription = openLabel,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }
}
