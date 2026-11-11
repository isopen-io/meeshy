package me.meeshy.app.calls

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.sdk.model.call.CallCaptionLabels
import me.meeshy.sdk.model.call.CallCaptionsFooter
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.sdk.model.call.CallLiveCaptionLines
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallPillWidth
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CAPTION_TARGET = 48.dp

/**
 * The captions as the pill carries them (#17343): they read the live state themselves, so the pill and the glass of a
 * mode ([hasOwnGlass]) draw the same band. Touching « Journal » asks the screen to open the journal in the pill; a mode
 * that frees the screen (Effects, Montage) shows the band without that button ([opensJournal] = false, iOS `opensJournal`).
 */
@Composable
internal fun CallCaptionsBandHost(
    state: CallUiState,
    hasOwnGlass: Boolean,
    modifier: Modifier = Modifier,
    opensJournal: Boolean = true,
    viewModel: CallCaptionsViewModel = hiltViewModel(),
) {
    val captions by viewModel.state.collectAsStateWithLifecycle()
    val labels = rememberCaptionLabels()
    val lines = rememberStableLines(remember(captions, labels) { viewModel.bandLines(captions, labels) })
    val toggle = remember(viewModel) { { key: String -> viewModel.toggleReveal(key) } }
    CallCaptionsBand(
        lines = lines,
        onToggleOriginal = toggle,
        onOpenJournal = viewModel::openJournal,
        modifier = modifier,
        captures = state.liveCaptures,
        peerName = state.peerName,
        hasOwnGlass = hasOwnGlass,
        opensJournal = opensJournal,
    )
}

@Composable
internal fun rememberCaptionLabels(): CallCaptionLabels {
    val me = stringResource(R.string.call_captions_me)
    val unknown = stringResource(R.string.call_unknown_peer)
    return remember(me, unknown) { CallCaptionLabels(me = me, unknown = unknown) }
}

/**
 * A line is the SAME instance while it says the same thing: a sentence that arrives redraws its own row, never the rows
 * already read (iOS `CallCaptionRow: Equatable`). The projection builds new lines at every change of state.
 */
@Composable
internal fun rememberStableLines(lines: List<CallLiveCaptionLine>): List<CallLiveCaptionLine> {
    val kept = remember { HashMap<String, CallLiveCaptionLine>() }
    return remember(lines) {
        val stable = lines.map { line -> kept[line.key]?.takeIf { it == line } ?: line }
        kept.clear()
        stable.forEach { kept[it.key] = it }
        stable
    }
}

/**
 * The two last sentences, a foot (what the line says of its translation) and the Journal button. They live IN the pill,
 * above its base row, in the same glass ([hasOwnGlass] = false), stowed or not: a touch that stows the chrome tightens
 * THAT glass around them (G1.3, laws 11 and 17), no second glass. Only a mode (Effects, Montage), which has no pill, gives
 * them a glass of their own, limited to the width of the pill that carries text ([CallPillWidth]).
 */
@Composable
internal fun CallCaptionsBand(
    lines: List<CallLiveCaptionLine>,
    onToggleOriginal: (String) -> Unit,
    onOpenJournal: () -> Unit,
    modifier: Modifier = Modifier,
    /** #16665 — the dated captures, mixed with the sentences at their time (R1). */
    captures: List<CallLiveCapture> = emptyList(),
    peerName: String = "",
    hasOwnGlass: Boolean = false,
    opensJournal: Boolean = true,
) {
    val region = stringResource(R.string.call_captions_region)
    val swallowsTouch = Modifier.pointerInput(Unit) { detectTapGestures { } }
    val content = @Composable {
        CallCaptionsContent(
            lines = lines,
            onToggleOriginal = onToggleOriginal,
            onOpenJournal = onOpenJournal,
            captures = captures,
            peerName = peerName,
            opensJournal = opensJournal,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
    }
    if (hasOwnGlass) {
        CallControlsGlass(modifier = modifier.widthIn(max = CallPillWidth.maxWidthDp(CallPillText.CaptionsAlone).dp).fillMaxWidth().then(swallowsTouch).semantics { contentDescription = region }) {
            content()
        }
    } else {
        Box(modifier.fillMaxWidth().then(swallowsTouch).semantics { contentDescription = region }) { content() }
    }
}

@Composable
private fun CallCaptionsContent(
    lines: List<CallLiveCaptionLine>,
    onToggleOriginal: (String) -> Unit,
    onOpenJournal: () -> Unit,
    captures: List<CallLiveCapture>,
    peerName: String,
    opensJournal: Boolean,
    modifier: Modifier = Modifier,
) {
    val you = stringResource(R.string.call_avatar_you)
    val now = rememberSettlingClock(lines)
    val settled = remember(lines, now) { lines.map { it.settled(now) } }
    val entries = remember(settled, captures) { CallBandEntries.last(settled, captures, BAND_LINES) }
    val footer = remember(settled) { CallCaptionsFooter.resolve(settled) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            if (entries.isEmpty()) {
                Text(
                    text = stringResource(R.string.call_captions_waiting),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.6f),
                )
            } else {
                entries.forEach { entry ->
                    key(entry.hashKey()) {
                        when (entry) {
                            is CallBandEntry.Sentence -> CallCaptionRow(line = entry.line, showsTime = false, onToggleOriginal = onToggleOriginal, showsWaiting = true)
                            is CallBandEntry.Capture -> {
                                val capture = entry.capture
                                CallCaptureLine(
                                    name = liveCaptureName(capture, selfId = null, youLabel = you, peerName = peerName),
                                    nameColor = hexColor(CallSpeakerColor.hex(capture.userId.ifBlank { peerName })),
                                    kind = capture.kind,
                                    elapsed = capture.elapsedLabel,
                                    ink = Color.White.copy(alpha = 0.75f),
                                )
                            }
                        }
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            CallCaptionsFootNote(footer, modifier = Modifier.weight(1f))
            if (opensJournal) CallJournalChip(onOpenJournal)
        }
    }
}

/** The foot: what the lines say of their translation; it fades from one note to the next, never swaps at once. */
@Composable
private fun CallCaptionsFootNote(footer: CallCaptionsFooter, modifier: Modifier = Modifier) {
    val reduceMotion = rememberCallReduceMotion()
    val note = when (footer) {
        CallCaptionsFooter.None -> null
        is CallCaptionsFooter.Translating -> stringResource(R.string.call_captions_footer_translating, footer.language)
        is CallCaptionsFooter.TouchForOriginal -> stringResource(R.string.call_captions_footer_touch_for_original, footer.pair)
        is CallCaptionsFooter.TranslatedLanguages ->
            pluralStringResource(R.plurals.call_captions_footer_translated_languages, footer.count, footer.count)
    }
    val fade = if (reduceMotion) 120 else 220
    AnimatedContent(
        targetState = note,
        modifier = modifier,
        transitionSpec = { fadeIn(tween(fade)) togetherWith fadeOut(tween(fade)) },
        label = "captions-foot",
    ) { shown ->
        if (shown != null) {
            Text(
                text = shown,
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyMediaChromeColors.OnMediaSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * The clock the awaited translations settle on: it only moves at the next deadline, so a wait that falls takes its dots
 * (and its « translating » foot) down at that very instant and nothing redraws before.
 */
@Composable
private fun rememberSettlingClock(lines: List<CallLiveCaptionLine>): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val next = CallLiveCaptionLines.nextDeadline(lines, now)
    LaunchedEffect(next) {
        if (next != null) {
            delay((next - System.currentTimeMillis()).coerceAtLeast(0))
            now = maxOf(System.currentTimeMillis(), next)
        }
    }
    return now
}

private fun CallBandEntry.hashKey(): String = when (this) {
    is CallBandEntry.Sentence -> line.key
    is CallBandEntry.Capture -> "capture:${capture.id}"
}

/** The « Journal » button: a glass chip of the same atom as the other buttons of the call, a 48 dp target. */
@Composable
private fun CallJournalChip(onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val hint = stringResource(R.string.call_captions_journal_hint)
    CallGlassButtonSurface(
        role = CallButtonRole.Neutral,
        shape = CircleShape,
        isPressed = pressed,
        modifier = Modifier
            .defaultMinSize(minHeight = CAPTION_TARGET, minWidth = CAPTION_TARGET)
            .clip(CircleShape)
            .clickable(interactionSource = source, indication = null, onClickLabel = hint, role = Role.Button, onClick = onClick),
    ) {
        Text(
            text = stringResource(R.string.call_captions_journal),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md),
        )
    }
}
