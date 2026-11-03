package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.SendAttemptCount
import me.meeshy.sdk.model.SendAttemptOrdinal
import me.meeshy.sdk.model.SendTransport
import me.meeshy.ui.component.bubble.SendHistory
import me.meeshy.ui.component.bubble.SendHistoryRow
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La carte « Historique d'envoi » de la fiche d'un message sortant (miroir de `MessageViewsSendAttemptsCard`, iOS) :
 * les tentatives de la première à la dernière, chacune avec son transport, son heure relative et, en rouge discret,
 * son erreur. Un succès n'a aucune icône alarmante. L'hôte ne la monte pas pour un message reçu ni sans tentative.
 */
@Composable
internal fun MessageViewsSendAttemptsCard(
    history: SendHistory,
    accentColor: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(accentColor.copy(alpha = 0.05f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Icon(MeeshyIcons.History, contentDescription = null, tint = accentColor.copy(alpha = 0.7f), modifier = Modifier.size(14.dp))
            Text(
                stringResource(R.string.message_detail_send_history_title),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            Text(
                pluralStringResource(
                    R.plurals.message_detail_send_history_attempt_count,
                    SendAttemptCount.quantity(history.count),
                    history.count,
                ),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
        history.rows.forEach { row -> SendAttemptRow(row, accentColor) }
    }
}

@Composable
private fun SendAttemptRow(row: SendHistoryRow, accentColor: Color) {
    val strings = rememberRelativeTimeStrings()
    val whenText = remember(row.startedAtMillis, strings) {
        RelativeTimeFormat.short(row.startedAtMillis, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault(), strings)
    }
    val outcome = stringResource(
        if (row.isSuccess) R.string.message_detail_send_history_outcome_succeeded else R.string.message_detail_send_history_outcome_failed,
    )
    val ordinal = when (val o = row.ordinal) {
        SendAttemptOrdinal.First -> stringResource(R.string.message_detail_send_history_first_attempt)
        is SendAttemptOrdinal.Nth -> stringResource(R.string.message_detail_send_history_attempt_number, o.number)
    }
    val transport = transportLabel(row)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = "$ordinal, $transport, $outcome, $whenText" },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            if (row.isSuccess) MeeshyIcons.CheckCircleFilled else MeeshyIcons.ErrorFilled,
            contentDescription = outcome,
            tint = if (row.isSuccess) MeeshyPalette.Success else MeeshyPalette.Error,
            modifier = Modifier.size(16.dp).padding(top = 1.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
                Text(ordinal, style = MaterialTheme.typography.labelLarge, color = MeeshyTheme.tokens.textPrimary)
                Text(
                    transport,
                    style = MaterialTheme.typography.labelSmall,
                    color = accentColor.copy(alpha = 0.8f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(accentColor.copy(alpha = 0.1f))
                        .padding(horizontal = MeeshySpacing.xsPlus, vertical = 1.dp),
                )
            }
            row.error?.let {
                Text(it, style = MaterialTheme.typography.labelSmall, color = MeeshyPalette.Error.copy(alpha = 0.8f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        Text(whenText, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
private fun transportLabel(row: SendHistoryRow): String = when (row.transport) {
    SendTransport.SOCKET_FIRST -> stringResource(R.string.message_detail_send_history_transport_realtime)
    SendTransport.REST -> stringResource(R.string.chat_send_attempt_transport_rest)
    SendTransport.SOCKET_FALLBACK -> stringResource(R.string.message_detail_send_history_transport_realtime_fallback)
    SendTransport.OUTBOX -> stringResource(R.string.message_detail_send_history_transport_auto_retry)
    null -> row.rawTransport
}
