package me.meeshy.app.calls

import android.text.format.DateFormat
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.Date
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.sdk.model.call.CallCaptionLabels
import me.meeshy.sdk.model.call.CallCaptionsFooter
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallPillWidth
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CAPTION_TARGET = 48.dp

/**
 * The captions as the pill carries them (#17343): they read the live state themselves, so the pill and the stowed glass
 * ([hasOwnGlass]) draw the same band. Touching « Journal » asks the screen to open the journal in the pill.
 */
@Composable
internal fun CallCaptionsBandHost(
    state: CallUiState,
    hasOwnGlass: Boolean,
    modifier: Modifier = Modifier,
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
    )
}

@Composable
internal fun rememberCaptionLabels(): CallCaptionLabels {
    val you = stringResource(R.string.call_avatar_you)
    val unknown = stringResource(R.string.call_unknown_peer)
    return remember(you, unknown) { CallCaptionLabels(you = you, unknown = unknown) }
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
 * above its base row, in the same glass ([hasOwnGlass] = false); they only take a glass of their own when the pill is
 * stowed (it carries no base row then, law 11), limited to the width of the pill that carries text ([CallPillWidth]).
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
) {
    val title = stringResource(R.string.call_captions_title)
    val content = @Composable {
        CallCaptionsContent(
            lines = lines,
            onToggleOriginal = onToggleOriginal,
            onOpenJournal = onOpenJournal,
            captures = captures,
            peerName = peerName,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
    }
    if (hasOwnGlass) {
        CallControlsGlass(modifier = modifier.widthIn(max = CallPillWidth.maxWidthDp(CallPillText.CaptionsAlone).dp).fillMaxWidth().semantics { contentDescription = title }) {
            content()
        }
    } else {
        Box(modifier.fillMaxWidth().semantics { contentDescription = title }) { content() }
    }
}

@Composable
private fun CallCaptionsContent(
    lines: List<CallLiveCaptionLine>,
    onToggleOriginal: (String) -> Unit,
    onOpenJournal: () -> Unit,
    captures: List<CallLiveCapture>,
    peerName: String,
    modifier: Modifier = Modifier,
) {
    val you = stringResource(R.string.call_avatar_you)
    val entries = remember(lines, captures) { CallBandEntries.last(lines, captures, BAND_LINES) }
    val footer = remember(lines) { CallCaptionsFooter.resolve(lines) }
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
                            is CallBandEntry.Sentence -> CallCaptionRow(line = entry.line, showsTime = false, onToggleOriginal = onToggleOriginal)
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
            if (footer is CallCaptionsFooter.TouchForOriginal) {
                Text(
                    text = stringResource(R.string.call_captions_footer_touch_for_original, footer.pair),
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyMediaChromeColors.OnMediaSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            } else {
                Spacer(Modifier.weight(1f))
            }
            CallJournalChip(onOpenJournal)
        }
    }
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

/**
 * One sentence: the speaker's name in HIS colour, the « EN → FR » tag when translated, the words.
 * Touching a translated sentence shows its original, and back. TalkBack stops on FINAL sentences only.
 */
@Composable
internal fun CallCaptionRow(line: CallLiveCaptionLine, showsTime: Boolean, onToggleOriginal: (String) -> Unit) {
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
    val a11y = remember(line) { CallCaptionAccessibility.of(line) }
    val flip = { onToggleOriginal(line.key) }
    val speakerColor = remember(line.speakerId) {
        hexColor(CallSpeakerColor.hex(line.speakerId))
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 24.dp)
            .then(if (line.canRevealOriginal) Modifier.clickable(role = Role.Button, onClick = flip) else Modifier)
            .then(
                if (a11y.isHidden) {
                    Modifier.clearAndSetSemantics { }
                } else {
                    Modifier.semantics(mergeDescendants = true) {
                        contentDescription = a11y.label
                        if (line.canRevealOriginal) onClick(label = hint) { flip(); true }
                        if (a11y.announces) liveRegion = LiveRegionMode.Polite
                    }
                },
            ),
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
            color = CallSpeakerColor.textHex(line.speakerId, servesTranslation = !line.isShowingOriginal)?.let { hexColor(it) } ?: Color.White,
            modifier = Modifier.alpha(if (line.isFinal) 1f else 0.7f),
        )
    }
}
