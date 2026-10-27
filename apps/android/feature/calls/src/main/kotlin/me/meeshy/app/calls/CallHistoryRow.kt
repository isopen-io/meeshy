package me.meeshy.app.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallMade
import androidx.compose.material.icons.automirrored.filled.CallMissed
import androidx.compose.material.icons.automirrored.filled.CallReceived
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.UserPresence
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallDirection
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * One journal row — port of the iOS `CallJournalRow`. A tap opens the call's detail
 * ([onOpen]); calling back is a separate trailing button whose menu picks voice or
 * video ([onRedial]), so a row brushed while scrolling never places a call. A swipe from
 * the end erases the line from MY journal alone ([onHide], iOS `swipeActions`), and the
 * TalkBack custom action « Effacer » does the same. The avatar carries the contact's photo,
 * its name colour and the SERVED presence (nothing when the server serves none), and a
 * group call lists its first participants.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallHistoryRow(
    record: CallRecord,
    onOpen: () -> Unit,
    onRedial: (isVideo: Boolean) -> Unit,
    onHide: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hideLabel = stringResource(R.string.call_journal_hide)
    val dismiss = rememberSwipeToDismissBoxState(
        confirmValueChange = { target ->
            (target == SwipeToDismissBoxValue.EndToStart).also { if (it) onHide() }
        },
    )
    SwipeToDismissBox(
        state = dismiss,
        modifier = modifier,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            if (dismiss.dismissDirection == SwipeToDismissBoxValue.EndToStart) {
                Box(
                    Modifier.fillMaxSize().background(MeeshyPalette.Error).padding(horizontal = MeeshySpacing.xl),
                    contentAlignment = Alignment.CenterEnd,
                ) {
                    Icon(MeeshyIcons.DeleteFilled, contentDescription = null, tint = Color.White)
                }
            }
        },
    ) {
        CallHistoryRowContent(
            record = record,
            onOpen = onOpen,
            onRedial = onRedial,
            modifier = Modifier
                .semantics { customActions = listOf(CustomAccessibilityAction(hideLabel) { onHide(); true }) },
        )
    }
}

@Composable
private fun CallHistoryRowContent(
    record: CallRecord,
    onOpen: () -> Unit,
    onRedial: (isVideo: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val name = record.displayName(fallback = stringResource(R.string.call_unknown_peer))
    val presence = remember(record.peer) {
        record.peer?.let { UserPresence(isOnline = it.isOnline).state(System.currentTimeMillis()) }
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.xs, top = MeeshySpacing.sm, bottom = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f).clickable(onClick = onOpen).padding(vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(
                name = name,
                size = 48.dp,
                containerColor = hexColor(DynamicColorGenerator.colorForName(name), MeeshyPalette.Indigo500),
                presence = presence,
                imageUrl = record.avatarUrl,
            )
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (record.isMissed) MeeshyPalette.Error else MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                record.participantsLabel?.let { participants ->
                    Text(
                        text = participants,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CallDirectionIcon(record.directionKind)
                    if (record.isVideo) {
                        Spacer(Modifier.width(MeeshySpacing.xxs))
                        Icon(
                            imageVector = Icons.Filled.Videocam,
                            contentDescription = stringResource(R.string.call_detail_type_video),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = listOfNotNull(
                            CallTimeLabel.label(
                                startedAtIso = record.startedAt,
                                nowMillis = System.currentTimeMillis(),
                                zone = ZoneId.systemDefault(),
                                locale = Locale.getDefault(),
                                yesterday = stringResource(R.string.call_history_yesterday),
                            ).ifBlank { null },
                            record.durationLabel.ifBlank { null },
                            record.dataLabel,
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (record.peer != null) CallRedialButton(defaultIsVideo = record.isVideo, onRedial = onRedial)
    }
}

/** « Rappeler » : a menu between a voice and a video call (iOS `CallRowDialButton`). */
@Composable
internal fun CallRedialButton(defaultIsVideo: Boolean, onRedial: (isVideo: Boolean) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = stringResource(R.string.call_history_redial)
    val hint = stringResource(R.string.call_history_redial_hint)
    Box {
        IconButton(
            onClick = { open = true },
            modifier = Modifier.semantics { onClick(label = hint) { open = true; true } },
        ) {
            Icon(
                imageVector = if (defaultIsVideo) Icons.Filled.Videocam else Icons.Filled.Call,
                contentDescription = label,
                tint = MeeshyPalette.Indigo500,
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.call_start_audio)) },
                leadingIcon = { Icon(Icons.Filled.Call, contentDescription = null) },
                onClick = { open = false; onRedial(false) },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.call_start_video)) },
                leadingIcon = { Icon(Icons.Filled.Videocam, contentDescription = null) },
                onClick = { open = false; onRedial(true) },
            )
        }
    }
}

@Composable
internal fun CallDirectionIcon(direction: CallDirection) {
    val (icon, descRes, tint) = when (direction) {
        CallDirection.INCOMING -> Triple(
            Icons.AutoMirrored.Filled.CallReceived,
            R.string.call_history_incoming,
            MeeshyTheme.tokens.textSecondary,
        )
        CallDirection.OUTGOING -> Triple(
            Icons.AutoMirrored.Filled.CallMade,
            R.string.call_history_outgoing,
            MeeshyTheme.tokens.textSecondary,
        )
        CallDirection.MISSED -> Triple(
            Icons.AutoMirrored.Filled.CallMissed,
            R.string.call_history_missed,
            MeeshyPalette.Error,
        )
    }
    Icon(
        imageVector = icon,
        contentDescription = stringResource(descRes),
        tint = tint,
        modifier = Modifier.size(16.dp),
    )
}
