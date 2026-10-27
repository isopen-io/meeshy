package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
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
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.PlaceLabels
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La pastille « LIEU » du plateau : le lieu choisi attend le prochain envoi (iOS `pendingPlace`),
 * se retire d'un tap sur la croix, entre et sort par un fondu avec un léger rebond.
 */
@Composable
internal fun ComposerPlaceChip(
    place: SharedPlace?,
    accent: Color,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = place != null,
        modifier = modifier,
        enter = fadeIn() + scaleIn(initialScale = 0.85f),
        exit = fadeOut() + scaleOut(targetScale = 0.85f),
    ) {
        val shown = place ?: return@AnimatedVisibility
        val title = PlaceLabels.title(shown.name, shown.address) ?: PlaceLabels.coordinates(shown, 3)
        val removeLabel = stringResource(R.string.chat_search_clear)
        Row(
            Modifier
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(accent.copy(alpha = 0.12f))
                .padding(start = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(MeeshyIcons.LocationFilled, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
            Column(Modifier.widthIn(max = 240.dp)) {
                Text(
                    stringResource(R.string.composer_chip_kind_location),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = accent,
                )
                Text(title, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onRemove)
                    .semantics { role = Role.Button; contentDescription = removeLabel },
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Close, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
            }
        }
    }
}
