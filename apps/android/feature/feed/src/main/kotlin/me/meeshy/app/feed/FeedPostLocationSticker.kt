package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The location sticker rendered under a feed post's media — mirror of iOS
 * `FeedPostLocationSticker`. A pin + place label in an accent-coherent capsule.
 * The label is [FeedLocationPresentation.label], or the localized "Position partagée"
 * fallback when the place carries no name/address (a hand-dropped pin), so a
 * coordinate-only location still shows a tappable sticker rather than nothing.
 *
 * [onTap] opens the place on a map — orchestration stays in the screen so this
 * composable is a dumb, reusable atom (feed card, post detail, repost embed).
 */
@Composable
fun FeedPostLocationSticker(
    location: FeedLocationPresentation,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = location.label ?: stringResource(R.string.feed_location_shared)
    val openHint = stringResource(R.string.feed_location_open)
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f))
            .clickable(onClickLabel = openHint, role = Role.Button, onClick = onTap)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .semantics { contentDescription = label; this.role = Role.Button },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.LocationOn,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
