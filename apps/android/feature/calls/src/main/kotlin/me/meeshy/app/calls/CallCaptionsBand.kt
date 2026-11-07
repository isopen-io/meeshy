package me.meeshy.app.calls

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.Date
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallCaptionLabels
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.sdk.model.call.CallLiveCaptionLines
import me.meeshy.sdk.model.call.CaptionsMode
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CAPTION_TARGET = 48.dp

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
            captions.captionLines(state.journal.tail(BAND_LINES), state, labels)
        }
        CallCaptionsBand(lines = lines, onToggleOriginal = captions::toggleReveal, onOpenJournal = captions::openJournal)
    }
}

@Composable
internal fun rememberCaptionLabels(): CallCaptionLabels {
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
    val a11y = remember(line) { CallCaptionAccessibility.of(line) }
    val speakerColor = remember(line.speakerId) {
        hexColor(CallSpeakerColor.hex(line.speakerId))
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 24.dp)
            .then(if (line.canRevealOriginal) Modifier.clickable(role = Role.Button, onClick = onToggleOriginal) else Modifier)
            .then(
                if (a11y.isHidden) {
                    Modifier.clearAndSetSemantics { }
                } else {
                    Modifier.semantics(mergeDescendants = true) {
                        contentDescription = a11y.label
                        if (line.canRevealOriginal) onClick(label = hint) { onToggleOriginal(); true }
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
            color = speakerColor,
            modifier = Modifier.alpha(if (line.isFinal) 1f else 0.7f),
        )
    }
}
