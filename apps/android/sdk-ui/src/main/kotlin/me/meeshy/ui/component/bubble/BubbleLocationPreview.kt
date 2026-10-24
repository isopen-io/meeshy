package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
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
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Compact preview of a shared-location attachment — Android render of the iOS
 * `LocationMessageView` / "Position partagée" placeholder. Shows a pin, the place
 * name (or a generic label), and the coordinates when present; tapping hands the
 * location's `geo:` URI to the host to open in an external maps app.
 */
@Composable
internal fun LocationPreview(
    location: BubbleLocation,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val openLabel = stringResource(R.string.bubble_location_open)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = openLabel
                }
            }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.LocationOn,
            contentDescription = null,
            tint = onColor.copy(alpha = 0.8f),
            modifier = Modifier.size(20.dp),
        )
        Column {
            Text(
                text = location.placeName ?: stringResource(R.string.bubble_location_shared),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = onColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (location.hasCoordinates) {
                Text(
                    text = "${location.latitude}, ${location.longitude}",
                    style = MaterialTheme.typography.labelSmall,
                    color = onColor.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
