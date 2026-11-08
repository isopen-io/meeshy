package me.meeshy.ui.component.focal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.bubble.BubbleStoryReply
import me.meeshy.ui.component.bubble.StoryCitationCard

/**
 * La carte d'une story citée AVEC le filet de citation (iOS `FocalStoryCitationQuote`) : la même
 * fonction que la citation de message, le même filet — la carte garde ses 132 de large, le filet sa
 * hauteur intrinsèque, et le toucher ouvre la story.
 */
@Composable
public fun FocalStoryCitationQuote(
    story: BubbleStoryReply,
    railColor: Color,
    accentColor: Color,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(FocalQuoteRailMetrics.spacing),
        modifier = modifier.height(IntrinsicSize.Min),
    ) {
        FocalQuoteRail(color = railColor)
        StoryCitationCard(story = story, accentColor = accentColor, onOpen = onOpen)
    }
}
