package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun DaySeparator(dayMillis: Long, modifier: Modifier = Modifier) {
    val label = MessageDayLabel.label(
        dayMillis = dayMillis,
        nowMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        today = stringResource(R.string.chat_date_today),
        yesterday = stringResource(R.string.chat_date_yesterday),
        dayBeforeYesterday = stringResource(R.string.chat_date_day_before_yesterday),
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.7f))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
    }
}

/**
 * The floating "sticky" day pill (WhatsApp-style) that hovers at the top of the
 * message list, naming the day of the topmost visible content. Which day it shows
 * is decided by [PinnedDayHeader.governingDayMillis]; this only draws it. It reuses
 * the same label + pill treatment as [DaySeparator] with a soft shadow so it reads
 * as floating above the scrolling content.
 */
@Composable
internal fun PinnedDayHeaderPill(dayMillis: Long, modifier: Modifier = Modifier) {
    val label = MessageDayLabel.label(
        dayMillis = dayMillis,
        nowMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        today = stringResource(R.string.chat_date_today),
        yesterday = stringResource(R.string.chat_date_yesterday),
        dayBeforeYesterday = stringResource(R.string.chat_date_day_before_yesterday),
    )
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier
            .shadow(elevation = 2.dp, shape = RoundedCornerShape(MeeshyRadius.pill))
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.95f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
    )
}

/**
 * The "new messages" boundary drawn directly above the first unread message
 * (port of iOS's unread separator). Accent-coherent: a thin accent rule on each
 * side of a centered accent-tinted "Nouveaux messages" pill.
 */
@Composable
internal fun UnreadSeparatorRow(accentColor: Color, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = accentColor.copy(alpha = 0.4f))
        Text(
            text = stringResource(R.string.chat_unread_separator),
            style = MaterialTheme.typography.labelMedium,
            color = accentColor,
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(accentColor.copy(alpha = 0.12f))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
        HorizontalDivider(modifier = Modifier.weight(1f), color = accentColor.copy(alpha = 0.4f))
    }
}

/**
 * The end-to-end-encryption notice pinned at the top of an encrypted conversation's
 * history — the faithful port of iOS `ConversationView.encryptionDisclaimer` (lock
 * glyph in an accent-tinted disc + centered reassurance copy). Accent-coherent per
 * the conversation-context colour rule; "when to show it" is the pure
 * [EncryptionDisclaimer] decision surfaced by [ChatUiState.showEncryptionDisclaimer].
 */
@Composable
internal fun EncryptionNoticeRow(accentColor: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier
                .clip(CircleShape)
                .background(accentColor.copy(alpha = 0.15f))
                .padding(MeeshySpacing.sm)
                .size(16.dp),
        )
        Text(
            text = stringResource(R.string.chat_encryption_notice),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
