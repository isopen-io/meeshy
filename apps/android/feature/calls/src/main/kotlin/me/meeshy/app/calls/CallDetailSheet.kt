package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallDirection
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The detail of one past call — port of the iOS `CallDetailSheet`: the contact,
 * direction and time, « Appel vocal » / « Appel vidéo » to call back (direct calls
 * only, as on iOS), then the type, date, duration, data and number of the call.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallDetailSheet(
    record: CallRecord,
    onRedial: (isVideo: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val name = record.displayName(fallback = stringResource(R.string.call_unknown_peer))
    val accent = hexColor(DynamicColorGenerator.colorForName(name), MeeshyPalette.Indigo500)
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 560.dp)
                .padding(horizontal = MeeshySpacing.xl)
                .navigationBarsPadding()
                .padding(bottom = MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            MeeshyAvatar(name = name, size = 80.dp, containerColor = accent, imageUrl = record.avatarUrl)
            Text(
                text = name,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            CallDetailStatusLine(record)
            if (record.peer != null) CallDetailRedialButtons(accent, onRedial)
            CallDetailCard(record)
        }
    }
}

@Composable
private fun CallDetailStatusLine(record: CallRecord) {
    val tint = if (record.isMissed) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary
    val direction = stringResource(
        when (record.directionKind) {
            CallDirection.INCOMING -> R.string.call_history_incoming
            CallDirection.OUTGOING -> R.string.call_history_outgoing
            CallDirection.MISSED -> R.string.call_history_missed
        },
    )
    val time = CallTimeLabel.label(
        startedAtIso = record.startedAt,
        nowMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        yesterday = stringResource(R.string.call_history_yesterday),
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = if (record.isVideo) Icons.Filled.Videocam else Icons.Filled.Call,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.xsPlus))
        Text(
            text = listOf(direction, time).filter { it.isNotBlank() }.joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = tint,
        )
    }
}

@Composable
private fun CallDetailRedialButtons(accent: Color, onRedial: (isVideo: Boolean) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        listOf(false, true).forEach { video ->
            Button(
                onClick = { onRedial(video) },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = Color.White),
            ) {
                Icon(if (video) Icons.Filled.Videocam else Icons.Filled.Call, contentDescription = null)
                Spacer(Modifier.width(MeeshySpacing.sm))
                Text(stringResource(if (video) R.string.call_start_video else R.string.call_start_audio))
            }
        }
    }
}

@Composable
private fun CallDetailCard(record: CallRecord) {
    val facts = CallDetailFacts.of(record, ZoneId.systemDefault(), Locale.getDefault())
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshyRadius.md))
            .padding(vertical = MeeshySpacing.xs),
    ) {
        facts.forEach { fact ->
            val (icon, label) = factLabel(fact.kind, record.isVideo)
            val value = fact.value ?: stringResource(
                if (record.isVideo) R.string.call_detail_type_video else R.string.call_detail_type_audio,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(MeeshySpacing.md))
                Text(label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
                Spacer(Modifier.weight(1f))
                Text(value, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
            }
        }
    }
}

@Composable
private fun factLabel(kind: CallDetailFact.Kind, isVideo: Boolean): Pair<ImageVector, String> = when (kind) {
    CallDetailFact.Kind.TYPE ->
        (if (isVideo) Icons.Filled.Videocam else Icons.Filled.Call) to stringResource(R.string.call_detail_type)
    CallDetailFact.Kind.DATE -> Icons.Filled.CalendarToday to stringResource(R.string.call_detail_date)
    CallDetailFact.Kind.DURATION -> Icons.Filled.Schedule to stringResource(R.string.call_detail_duration)
    CallDetailFact.Kind.DATA -> Icons.AutoMirrored.Filled.CompareArrows to stringResource(R.string.call_detail_data)
    CallDetailFact.Kind.PHONE -> Icons.Filled.Tag to stringResource(R.string.call_detail_phone)
}
