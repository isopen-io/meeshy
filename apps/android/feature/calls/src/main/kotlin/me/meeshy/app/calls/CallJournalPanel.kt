package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import androidx.activity.compose.BackHandler
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.sdk.model.call.CallJournalFollow
import me.meeshy.sdk.model.call.CallJournalSizing
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CAPTION_TARGET = 48.dp

/**
 * The whole call, DRAWN IN THE PILL in place of the captions (#17343, iOS `CallJournalPanel`): a header (« Journal » on
 * the left, the Translated / Original switch on the right, nothing else, plate P6), then the list, which scrolls and offers « Back to live ». The switch is the journal's OWN (the band does not follow, law 7), a touch per sentence flips it there only. The list has the height of [CallJournalSizing]; the base row of the
 * pill stays under it and stays touchable. It keeps the whole call, captions on or off (#17342), each sentence dated by the time in the call. The (…), the
 * « Journal » button and the back button (TalkBack's escape) close it.
 */
@Composable
internal fun CallJournalPanel(
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CallCaptionsViewModel = hiltViewModel(),
    /** #16665 — the dated captures of the call, in the journal at their time (loi 13). */
    captures: List<CallLiveCapture> = emptyList(),
    peerName: String = "",
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val view by viewModel.journalView.collectAsStateWithLifecycle()
    val labels = rememberCaptionLabels()
    val lines = rememberStableLines(
        remember(state.journal, view, state.callStartedAtMs, labels) { viewModel.journalLines(state, view, labels) },
    )
    val toggle = remember(viewModel) { { key: String -> viewModel.toggleJournalReveal(key) } }
    val title = stringResource(R.string.call_captions_journal_title)
    val windowHeight = LocalConfiguration.current.screenHeightDp.toFloat()
    BackHandler(onBack = onClose)
    Column(modifier.fillMaxWidth().semantics { paneTitle = title }) {
        CallJournalHeader(showsOriginal = view.showsOriginal, onShowsOriginal = viewModel::setJournalShowsOriginal)
        CallJournalList(
            lines = lines,
            onToggleOriginal = toggle,
            modifier = Modifier.height(CallJournalSizing.heightDp(windowHeight).dp),
            captures = captures,
            peerName = peerName,
        )
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CallJournalHeader(showsOriginal: Boolean, onShowsOriginal: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.call_captions_journal),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            maxLines = 1,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        val options = listOf(false to R.string.call_captions_translated, true to R.string.call_captions_original)
        SingleChoiceSegmentedButtonRow(modifier = Modifier.widthIn(max = JOURNAL_SWITCH_MAX_WIDTH)) {
            options.forEachIndexed { index, (original, label) ->
                SegmentedButton(
                    selected = showsOriginal == original,
                    onClick = { onShowsOriginal(original) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                    modifier = Modifier.defaultMinSize(minHeight = CAPTION_TARGET),
                ) { Text(stringResource(label), maxLines = 1) }
            }
        }
    }
}

private val JOURNAL_SWITCH_MAX_WIDTH = 200.dp

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
            items(entries, key = { entry -> journalKey(entry) }, contentType = { entry -> entry::class }) { entry ->
                when (entry) {
                    is CallBandEntry.Sentence ->
                        CallCaptionRow(line = entry.line, showsTime = true, onToggleOriginal = onToggleOriginal)
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
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    CallGlassButtonSurface(
        role = CallButtonRole.Neutral,
        shape = CircleShape,
        isPressed = pressed,
        modifier = modifier
            .defaultMinSize(minHeight = CAPTION_TARGET)
            .clip(CircleShape)
            .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
            .semantics { if (hasUnseen) stateDescription = newLines },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.md),
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
}

private fun journalKey(entry: CallBandEntry): String = when (entry) {
    is CallBandEntry.Sentence -> entry.line.key
    is CallBandEntry.Capture -> "capture:${entry.capture.id}"
}
