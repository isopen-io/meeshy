package me.meeshy.app.calls

import android.text.format.DateFormat
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
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Date
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallCaptionLabels
import me.meeshy.sdk.model.call.CallCaptionReader
import me.meeshy.sdk.model.call.CallCaptionsState
import me.meeshy.sdk.model.call.CallJournalFollow
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.sdk.model.call.CallLiveCaptionLines
import me.meeshy.sdk.model.call.CaptionsMode
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CAPTION_TARGET = 48.dp
private const val BAND_LINES = 2

/** The screen's door to the captions: the chip folded into [CallUiState], the journal, the journal requests. */
@HiltViewModel
class CallCaptionsViewModel @Inject constructor(
    private val captions: CallCaptionsController,
) : ViewModel() {
    val state: StateFlow<CallCaptionsState> = captions.state
    val journalRequests: SharedFlow<Unit> = captions.journalRequests
    val reader: CallCaptionReader get() = captions.reader
    val peerName: String get() = captions.peerDisplayName

    fun toggleReveal(key: String) = captions.toggleReveal(key)

    fun setShowsOriginal(showsOriginal: Boolean) = captions.setShowsOriginal(showsOriginal)

    fun openJournal() = captions.openJournal()
}

/** The band, in the captions slot, while the captions are on (it stays when the controls fade, as iOS). */
@Singleton
class CallCaptionsBandOverlay @Inject constructor(
    private val captions: CallCaptionsController,
) : CallOverlay {
    override val id: String = "call-captions-band"
    override val slot: CallOverlaySlot = CallOverlaySlot.Captions

    override fun isVisible(state: CallUiState): Boolean = state.captions.mode != CaptionsMode.Off

    @Composable
    override fun Content(context: CallOverlayContext) {
        val state by captions.state.collectAsStateWithLifecycle()
        val labels = rememberCaptionLabels()
        val lines = remember(state, labels) {
            CallLiveCaptionLines.lines(
                segments = state.journal.tail(BAND_LINES),
                reader = captions.reader,
                peerName = captions.peerDisplayName,
                prefersOriginal = state.showsOriginal,
                revealed = state.revealed,
                labels = labels,
            )
        }
        CallCaptionsBand(lines = lines, onToggleOriginal = captions::toggleReveal, onOpenJournal = captions::openJournal)
    }
}

@Composable
private fun rememberCaptionLabels(): CallCaptionLabels {
    val you = stringResource(R.string.call_avatar_you)
    val unknown = stringResource(R.string.call_unknown_peer)
    return remember(you, unknown) { CallCaptionLabels(you = you, unknown = unknown) }
}

/** The two last sentences and the Journal, on their own dark glass just above the pill. */
@Composable
internal fun CallCaptionsBand(
    lines: List<CallLiveCaptionLine>,
    onToggleOriginal: (String) -> Unit,
    onOpenJournal: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val title = stringResource(R.string.call_captions_title)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
            .clip(RoundedCornerShape(20.dp))
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(start = MeeshySpacing.md, end = MeeshySpacing.xs, top = MeeshySpacing.xs, bottom = MeeshySpacing.xs)
            .semantics { contentDescription = title },
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f).padding(vertical = MeeshySpacing.xs),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            if (lines.isEmpty()) {
                Text(
                    text = stringResource(R.string.call_captions_waiting),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.6f),
                )
            } else {
                lines.forEach { line -> CallCaptionRow(line = line, showsTime = false, onToggleOriginal = { onToggleOriginal(line.key) }) }
            }
        }
        IconButton(
            onClick = onOpenJournal,
            modifier = Modifier.size(CAPTION_TARGET),
        ) {
            Icon(
                imageVector = MeeshyIcons.ListChecklist,
                contentDescription = stringResource(R.string.call_captions_journal),
                tint = Color.White.copy(alpha = 0.8f),
            )
        }
    }
}

/**
 * One sentence: the speaker's name in HIS colour, the « EN → FR » tag when translated, the words.
 * Touching a translated sentence shows its original, and back. TalkBack stops on FINAL sentences only.
 */
@Composable
internal fun CallCaptionRow(line: CallLiveCaptionLine, showsTime: Boolean, onToggleOriginal: () -> Unit) {
    val context = LocalContext.current
    val heading = if (showsTime) {
        "${line.speakerName} (${DateFormat.getTimeFormat(context).format(Date(line.capturedAtMs))})"
    } else {
        line.speakerName
    }
    val hint = when {
        !line.canRevealOriginal -> null
        line.isShowingOriginal -> stringResource(R.string.call_transcript_show_translated)
        else -> stringResource(R.string.call_transcript_show_original)
    }
    val speakerColor = remember(line.speakerId) {
        hexColor(DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(line.speakerId), DynamicColorGenerator.ThemeMode.DARK))
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 24.dp)
            .then(if (line.canRevealOriginal) Modifier.clickable(role = Role.Button, onClick = onToggleOriginal) else Modifier)
            .semantics(mergeDescendants = true) {
                contentDescription = "${line.speakerName} : ${line.text}"
                if (line.canRevealOriginal) onClick(label = hint) { onToggleOriginal(); true }
                if (line.isFinal) liveRegion = LiveRegionMode.Polite
            },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
            Text(
                text = heading,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = speakerColor,
                maxLines = 1,
            )
            line.languageTag?.let { tag ->
                Text(
                    text = tag,
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White.copy(alpha = 0.6f),
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.12f))
                        .padding(horizontal = MeeshySpacing.xs, vertical = 1.dp),
                )
            }
        }
        Text(
            text = line.text,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (line.isFinal) FontWeight.Normal else FontWeight.Light,
            color = Color.White,
            modifier = Modifier.alpha(if (line.isFinal) 1f else 0.7f),
        )
    }
}

/**
 * The whole call, Translated or Original — the setting is the « Sous-titres » one, a touch per
 * sentence flips it (iOS `CallCaptionsJournalSheet`). Follows the live edge until the reader scrolls
 * up; « Revenir au direct » brings him back, with a dot when sentences arrived meanwhile.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallCaptionsJournalSheet(onDismiss: () -> Unit, viewModel: CallCaptionsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val labels = rememberCaptionLabels()
    val lines = remember(state, labels) {
        CallLiveCaptionLines.lines(
            segments = state.journal.segments,
            reader = viewModel.reader,
            peerName = viewModel.peerName,
            prefersOriginal = state.showsOriginal,
            revealed = state.revealed,
            labels = labels,
        )
    }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color(0xFF13111C), contentColor = Color.White) {
        Column(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.85f).navigationBarsPadding()) {
            CallJournalHeader(showsOriginal = state.showsOriginal, onShowsOriginal = viewModel::setShowsOriginal, onClose = onDismiss)
            CallJournalList(lines = lines, onToggleOriginal = viewModel::toggleReveal, modifier = Modifier.weight(1f))
            Text(
                text = stringResource(R.string.call_captions_local_pending),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.55f),
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            )
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
private fun CallJournalList(lines: List<CallLiveCaptionLine>, onToggleOriginal: (String) -> Unit, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var follow by remember { mutableStateOf(CallJournalFollow.LIVE) }
    val tail = lines.lastOrNull()?.let { "${lines.size}|${it.key}|${it.text.length}" }.orEmpty()

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
        if (lines.isEmpty()) return@LaunchedEffect
        if (follow.isFollowing) listState.animateScrollToItem(lines.lastIndex) else follow = follow.lineArrived()
    }

    Box(modifier = modifier.fillMaxWidth()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            if (lines.isEmpty()) {
                item(key = "waiting") {
                    Text(
                        text = stringResource(R.string.call_captions_waiting),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.6f),
                    )
                }
            }
            items(lines, key = { it.key }) { line ->
                CallCaptionRow(line = line, showsTime = true, onToggleOriginal = { onToggleOriginal(line.key) })
            }
        }
        if (follow.showsReturnToLive && lines.isNotEmpty()) {
            CallJournalReturnToLive(
                hasUnseen = follow.hasUnseen,
                onClick = {
                    follow = CallJournalFollow.LIVE
                    scope.launch { listState.animateScrollToItem(lines.lastIndex) }
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
            Box(Modifier.size(8.dp).clip(CircleShape).background(Color(0xFF818CF8)))
        }
    }
}
