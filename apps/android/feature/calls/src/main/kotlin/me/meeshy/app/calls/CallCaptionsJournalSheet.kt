package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallJournalFollow
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CAPTION_TARGET = 48.dp

/**
 * The whole call, Translated or Original — the setting is the « Sous-titres » one, a touch per
 * sentence flips it (iOS `CallCaptionsJournalSheet`). Follows the live edge until the reader scrolls
 * up; « Revenir au direct » brings him back, with a dot when sentences arrived meanwhile.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallCaptionsJournalSheet(
    onDismiss: () -> Unit,
    viewModel: CallCaptionsViewModel = hiltViewModel(),
    /** #16665 — the dated captures of the call, in the journal at their time (loi 13). */
    captures: List<CallLiveCapture> = emptyList(),
    peerName: String = "",
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val labels = rememberCaptionLabels()
    val lines = remember(state, labels) {
        viewModel.journalLines(state, labels)
    }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = CallPalette.Raised, contentColor = Color.White) {
        Column(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.85f).navigationBarsPadding()) {
            CallJournalHeader(showsOriginal = state.showsOriginal, onShowsOriginal = viewModel::setShowsOriginal, onClose = onDismiss)
            CallJournalList(lines = lines, onToggleOriginal = viewModel::toggleReveal, modifier = Modifier.weight(1f), captures = captures, peerName = peerName)
            state.ownSpeech.notCaptionedRes()?.let { notCaptioned ->
                Text(
                    text = stringResource(notCaptioned),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.55f),
                    modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CallJournalHeader(showsOriginal: Boolean, onShowsOriginal: (Boolean) -> Unit, onClose: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.call_captions_journal_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            TextButton(onClick = onClose, modifier = Modifier.defaultMinSize(minHeight = CAPTION_TARGET)) {
                Text(stringResource(R.string.call_panel_close))
            }
        }
        val options = listOf(false to R.string.call_captions_translated, true to R.string.call_captions_original)
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm)) {
            options.forEachIndexed { index, (original, label) ->
                SegmentedButton(
                    selected = showsOriginal == original,
                    onClick = { onShowsOriginal(original) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                    modifier = Modifier.defaultMinSize(minHeight = CAPTION_TARGET),
                ) { Text(stringResource(label)) }
            }
        }
    }
}

@Composable
internal fun CallJournalList(
    lines: List<CallLiveCaptionLine>,
    onToggleOriginal: (String) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: androidx.compose.ui.unit.Dp = MeeshySpacing.lg,
    captures: List<CallLiveCapture> = emptyList(),
    peerName: String = "",
) {
    val entries = remember(lines, captures) { CallBandEntries.all(lines, captures) }
    val you = stringResource(R.string.call_avatar_you)
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var follow by remember { mutableStateOf(CallJournalFollow.LIVE) }
    val tail = lines.lastOrNull()?.let { "${entries.size}|${it.key}|${it.text.length}" } ?: "${entries.size}"

    LaunchedEffect(listState) {
        var lastIndex = listState.firstVisibleItemIndex
        var lastOffset = listState.firstVisibleItemScrollOffset
        snapshotFlow { Triple(listState.firstVisibleItemIndex, listState.firstVisibleItemScrollOffset, listState.canScrollForward) }
            .collect { (index, offset, canScrollForward) ->
                val movedUp = index < lastIndex || (index == lastIndex && offset < lastOffset)
                lastIndex = index
                lastOffset = offset
                follow = follow.scrolled(atLiveEdge = !canScrollForward, movedUp = movedUp)
            }
    }
    LaunchedEffect(tail) {
        if (entries.isEmpty()) return@LaunchedEffect
        if (follow.isFollowing) listState.animateScrollToItem(entries.lastIndex) else follow = follow.lineArrived()
    }

    Box(modifier = modifier.fillMaxWidth()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(contentPadding),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            if (entries.isEmpty()) {
                item(key = "waiting") {
                    Text(
                        text = stringResource(R.string.call_captions_waiting),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.6f),
                    )
                }
            }
            items(entries, key = { entry -> journalKey(entry) }) { entry ->
                when (entry) {
                    is CallBandEntry.Sentence ->
                        CallCaptionRow(line = entry.line, showsTime = true, onToggleOriginal = { onToggleOriginal(entry.line.key) })
                    is CallBandEntry.Capture -> CallCaptureLine(
                        name = liveCaptureName(entry.capture, selfId = null, youLabel = you, peerName = peerName),
                        nameColor = hexColor(CallSpeakerColor.hex(entry.capture.userId.ifBlank { peerName })),
                        kind = entry.capture.kind,
                        elapsed = entry.capture.elapsedLabel,
                        ink = Color.White.copy(alpha = 0.75f),
                    )
                }
            }
        }
        if (follow.showsReturnToLive && entries.isNotEmpty()) {
            CallJournalReturnToLive(
                hasUnseen = follow.hasUnseen,
                onClick = {
                    follow = CallJournalFollow.LIVE
                    scope.launch { listState.animateScrollToItem(entries.lastIndex) }
                },
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = MeeshySpacing.md),
            )
        }
    }
}

@Composable
private fun CallJournalReturnToLive(hasUnseen: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val newLines = stringResource(R.string.call_captions_new_lines)
    Row(
        modifier = modifier
            .defaultMinSize(minHeight = CAPTION_TARGET)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.75f))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md)
            .semantics { if (hasUnseen) stateDescription = newLines },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Icon(MeeshyIcons.ArrowDown, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
        Text(stringResource(R.string.call_captions_back_to_live), style = MaterialTheme.typography.labelLarge, color = Color.White)
        if (hasUnseen) {
            Spacer(Modifier.width(2.dp))
            Box(Modifier.size(8.dp).clip(CircleShape).background(CallPalette.Brand))
        }
    }
}

private val PANEL_AVATAR = 44.dp

/**
 * The audio call's captions (iOS `transcriptPanel`): a real layout element between the compact header
 * and the pill — never a floating overlay over the actions. The same journal list, dark glass.
 */
@Composable
internal fun CallCaptionsTranscriptPanel(
    state: CallUiState,
    peer: CallPeerVisual,
    modifier: Modifier = Modifier,
    viewModel: CallCaptionsViewModel = hiltViewModel(),
) {
    val captions by viewModel.state.collectAsStateWithLifecycle()
    val labels = rememberCaptionLabels()
    val lines = remember(captions, labels) { viewModel.journalLines(captions, labels) }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            CallAvatarPair(name = state.peerName, peer = peer, size = PANEL_AVATAR)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = callPeerTitle(state.peerName),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = CallPalette.Ink,
                    maxLines = 1,
                )
                state.durationLabel?.let { clock ->
                    Text(text = clock, style = MaterialTheme.typography.bodySmall, color = CallPalette.Brand)
                }
            }
        }
        CallJournalList(
            lines = lines,
            captures = state.liveCaptures,
            peerName = state.peerName,
            onToggleOriginal = viewModel::toggleReveal,
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.Black.copy(alpha = 0.45f)),
            contentPadding = MeeshySpacing.md,
        )
    }
}

private fun journalKey(entry: CallBandEntry): String = when (entry) {
    is CallBandEntry.Sentence -> entry.line.key
    is CallBandEntry.Capture -> "capture:${entry.capture.id}"
}
