package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * A single chat message bubble (charte graphique §13.7). Outgoing bubbles use
 * [outgoingColor] (typically the conversation accent); a subtle translate icon
 * signals the Prisme is active without interrupting the reading flow.
 */
@Composable
public fun MessageBubble(
    content: BubbleContent,
    modifier: Modifier = Modifier,
    outgoingColor: Color = MeeshyPalette.Indigo500,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = if (content.isOutgoing) Arrangement.End else Arrangement.Start,
    ) {
        val onColor = if (content.isOutgoing) MeeshyPalette.White else MeeshyTheme.tokens.textPrimary
        Column(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(RoundedCornerShape(MeeshyRadius.xl))
                .background(
                    if (content.isOutgoing) outgoingColor else MeeshyTheme.tokens.backgroundTertiary,
                )
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        ) {
            if (content.showSenderName && content.senderName != null) {
                Text(
                    text = content.senderName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = onColor,
                )
            }

            if (content.isDeleted) {
                Text(
                    text = "Message deleted",
                    style = MaterialTheme.typography.bodyMedium,
                    fontStyle = FontStyle.Italic,
                    color = onColor.copy(alpha = 0.6f),
                )
            } else {
                Text(
                    text = content.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = onColor,
                )
            }

            if (content.isTranslated || content.isEdited) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = MeeshySpacing.xs),
                ) {
                    if (content.isTranslated) {
                        Icon(
                            imageVector = Icons.Filled.Translate,
                            contentDescription = "Translated",
                            tint = onColor.copy(alpha = 0.7f),
                            modifier = Modifier.size(14.dp),
                        )
                    }
                    if (content.isEdited) {
                        Text(
                            text = "edited",
                            style = MaterialTheme.typography.labelSmall,
                            color = onColor.copy(alpha = 0.7f),
                            modifier = Modifier.padding(start = MeeshySpacing.xs),
                        )
                    }
                }
            }
        }
    }
}
