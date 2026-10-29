package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La bulle de l'humeur d'un ami, ouverte par un appui sur son badge dans le rail de stories (iOS
 * `StatusBubbleOverlay`, #13662) : l'humeur, puis les trois gestes — réagir (rangée de réactions rapides),
 * republier, répondre. [onDwellEnd] part à la fermeture, quelle que soit la sortie.
 */
@Composable
fun MoodBubble(
    model: MoodBubbleModel,
    onReact: (String) -> Unit,
    onRepublish: () -> Unit,
    onReply: () -> Unit,
    onDismiss: () -> Unit,
    onDwellEnd: () -> Unit,
) {
    DisposableEffect(model.statusId) { onDispose(onDwellEnd) }
    Popup(
        alignment = Alignment.Center,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.lg),
            modifier = Modifier.widthIn(min = 160.dp, max = 260.dp),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier.padding(MeeshySpacing.lg),
            ) {
                Text(text = model.moodEmoji, style = MaterialTheme.typography.headlineMedium)
                Text(
                    text = model.username,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                model.content?.let { content ->
                    Text(text = content, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
                }
                model.viaUsername?.let { via ->
                    Text(
                        text = stringResource(R.string.status_bubble_via, via),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                if (model.reactions.isNotEmpty()) ReactionChips(model.reactions)
                if (model.canReact) ReactionPicker(onReact)
                if (model.canReply) BubbleAction(
                    label = stringResource(R.string.mood_bubble_reply),
                    icon = MeeshyIcons.Reply,
                    onClick = onReply,
                )
                if (model.canRepublish) BubbleAction(
                    label = stringResource(R.string.status_bubble_republish),
                    icon = MeeshyIcons.Repeat,
                    onClick = onRepublish,
                )
            }
        }
    }
}

@Composable
private fun ReactionChips(chips: List<MoodReactionChip>) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
        chips.forEach { chip ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier
                    .background(MeeshyPalette.Indigo500.copy(alpha = 0.10f), RoundedCornerShape(MeeshyRadius.pill))
                    .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
            ) {
                Text(text = chip.emoji, style = MaterialTheme.typography.labelMedium)
                Text(
                    text = chip.count.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
    }
}

@Composable
private fun ReactionPicker(onReact: (String) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.06f), RoundedCornerShape(MeeshyRadius.pill))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        EmojiCatalog.defaultQuickReactions.forEach { emoji ->
            val label = stringResource(R.string.mood_bubble_react, emoji)
            Text(
                text = emoji,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .clickable(role = Role.Button) { onReact(emoji) }
                    .padding(horizontal = 2.dp, vertical = 10.dp)
                    .semantics { contentDescription = label },
            )
        }
    }
}

@Composable
private fun BubbleAction(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = MeeshySpacing.sm)
            .semantics { contentDescription = label; role = Role.Button },
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = MeeshyPalette.Indigo400, modifier = Modifier.size(14.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyPalette.Indigo400,
        )
    }
}
