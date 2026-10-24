package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun typingLabelText(label: TypingLabel): String? = when (label) {
    TypingLabel.None -> null
    is TypingLabel.One -> stringResource(R.string.chat_typing_one, label.name)
    is TypingLabel.Two -> stringResource(R.string.chat_typing_two, label.first, label.second)
    is TypingLabel.Many -> stringResource(R.string.chat_typing_many, label.count)
}

@Composable
internal fun ChatHeaderSubtitleRow(subtitle: ChatHeaderSubtitle, accentColor: Color) {
    val (text, color) = when (subtitle) {
        ChatHeaderSubtitle.None -> return
        is ChatHeaderSubtitle.Members ->
            stringResource(R.string.chat_header_members, subtitle.count) to
                MeeshyTheme.tokens.textSecondary
        is ChatHeaderSubtitle.Typing ->
            (typingLabelText(subtitle.label) ?: return) to accentColor
    }
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(start = MeeshySpacing.md),
    )
}

/**
 * Overlapping avatar chips of who is composing, shown in the header beside the typing
 * subtitle (iOS parity — avatars, not just the name). The count and truncation are
 * decided by the pure [TypingAvatarStack]; this only overlaps the chips and renders a
 * "+N" pill for the overflow. Each chip carries a surface-coloured ring so the overlap
 * reads cleanly; avatars degrade to accent-tinted initials.
 */
@Composable
internal fun TypingAvatarCluster(stack: TypingAvatarStack, accentColor: Color) {
    if (stack.visible.isEmpty()) return
    val ringColor = MeeshyTheme.tokens.backgroundPrimary
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy((-6).dp),
    ) {
        stack.visible.forEach { chip ->
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(ringColor)
                    .padding(1.5.dp),
            ) {
                MeeshyAvatar(name = chip.name, size = 20.dp, containerColor = accentColor, imageUrl = chip.avatarUrl)
            }
        }
        if (stack.overflow > 0) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(ringColor)
                    .padding(1.5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(MeeshyTheme.tokens.backgroundSecondary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "+${stack.overflow}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
        }
    }
}

@Composable
internal fun TypingIndicator(participants: List<TypingParticipant>, modifier: Modifier = Modifier) {
    val text = typingLabelText(TypingLabel.of(participants)) ?: return
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
}
