package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun DaySeparator(dayMillis: Long, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.xsPlus),
        contentAlignment = Alignment.Center,
    ) {
        DayPill(dayMillis)
    }
}

/**
 * The floating "sticky" day pill that hovers at the top of the message list, naming the day of
 * the topmost visible content. Which day it shows is decided by
 * [PinnedDayHeader.governingDayMillis]; it is the very same pill as [DaySeparator] (iOS
 * `MessageDayStickyOverlay` reuses `MessageDaySeparator`, sans ombre).
 */
@Composable
internal fun PinnedDayHeaderPill(dayMillis: Long, modifier: Modifier = Modifier) {
    DayPill(dayMillis, modifier)
}

/**
 * La capsule de jour, port d'iOS `MessageDaySeparator` : fond translucide, trait fin indigo 200
 * (clair) / 900 (sombre), libellé 12 sp semi-gras indigo 700 / 200, 12 × 4 de marge ; lue comme
 * un titre par TalkBack.
 */
@Composable
private fun DayPill(dayMillis: Long, modifier: Modifier = Modifier) {
    val label = MessageDayLabel.label(
        dayMillis = dayMillis,
        nowMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        today = stringResource(R.string.chat_date_today),
        yesterday = stringResource(R.string.chat_date_yesterday),
        dayBeforeYesterday = stringResource(R.string.chat_date_day_before_yesterday),
    )
    val isDark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(MeeshyRadius.pill)
    Text(
        text = label,
        fontSize = MeeshyFontSize.small,
        fontWeight = FontWeight.SemiBold,
        color = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Indigo700,
        modifier = modifier
            .semantics { heading() }
            .clip(shape)
            .background(MeeshyTheme.tokens.backgroundPrimary.copy(alpha = 0.85f))
            .border(0.5.dp, if (isDark) MeeshyPalette.Indigo900 else MeeshyPalette.Indigo200, shape)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
    )
}

/**
 * The "new messages" boundary drawn directly above the first unread message — port of iOS
 * `FirstUnreadSeparatorRow`: two 1 dp rules in the text colour at 30 % (light) / 45 % (dark)
 * around « N messages non lus » in 12 sp semi-bold brand indigo (500 light / 300 dark). No pill,
 * no conversation accent; read as a heading.
 */
@Composable
internal fun UnreadSeparatorRow(count: Int, modifier: Modifier = Modifier) {
    val isDark = MeeshyTheme.isDark
    val ruleColor = MeeshyTheme.tokens.textPrimary.copy(alpha = if (isDark) 0.45f else 0.30f)
    val label = if (count > 0) {
        pluralStringResource(R.plurals.chat_unread_separator_count, count, count)
    } else {
        stringResource(R.string.chat_unread_separator)
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f), thickness = 1.dp, color = ruleColor)
        Text(
            text = label,
            fontSize = MeeshyFontSize.small,
            fontWeight = FontWeight.SemiBold,
            color = if (isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo500,
            modifier = Modifier.semantics { heading() },
        )
        HorizontalDivider(modifier = Modifier.weight(1f), thickness = 1.dp, color = ruleColor)
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
