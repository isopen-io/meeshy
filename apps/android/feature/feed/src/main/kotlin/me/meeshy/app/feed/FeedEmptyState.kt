package me.meeshy.app.feed

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * « Aucune publication » (iOS `AdaptiveContentUnavailableView`, `text.bubble`) : un disque dégradé aux couleurs de
 * la marque derrière une bulle de discussion, puis le titre seul.
 */
@Composable
internal fun FeedEmptyState(modifier: Modifier = Modifier) {
    FeedStatePane(
        icon = {
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            listOf(MeeshyPalette.Indigo500.copy(alpha = 0.28f), MeeshyPalette.Indigo700.copy(alpha = 0.12f)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = MeeshyIcons.ChatBubbleOutlineOutlined,
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo400,
                    modifier = Modifier.size(44.dp),
                )
            }
        },
        title = stringResource(R.string.feed_empty),
        subtitle = null,
        modifier = modifier,
    )
}
