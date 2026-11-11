package me.meeshy.app.calls

import android.text.format.DateFormat
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
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
import androidx.compose.ui.unit.dp
import java.util.Date
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private const val FADE_MS = 220
private const val FADE_REDUCED_MS = 120
private const val WAITING_STEP_MS = 450L

/**
 * One sentence: « Me · text » in one piece, the name in the colour of its author, the text in his when translated,
 * the label « EN » / « EN → FR » and the three waiting dots (iOS `CallCaptionRow`). Touching a translated sentence
 * unfolds « Original · … » below it in secondary ink; touching it again folds it. TalkBack stops on FINAL sentences only.
 *
 * In the journal ([showsTime]) the header keeps its place: the name and the hour, the label, then the sentence.
 */
@Composable
internal fun CallCaptionRow(
    line: CallLiveCaptionLine,
    showsTime: Boolean,
    onToggleOriginal: (String) -> Unit,
    showsWaiting: Boolean = false,
) {
    val reduceMotion = rememberCallReduceMotion()
    val isWaiting = showsWaiting && line.isAwaitingTranslation
    val a11y = CallCaptionAccessibility.of(
        line = line,
        originalWord = stringResource(R.string.call_captions_original),
        translatingWord = stringResource(R.string.call_captions_translating).takeIf { isWaiting },
    )
    val hint = when {
        !line.canRevealOriginal -> null
        line.originalBelow != null -> stringResource(R.string.call_captions_hide_original_hint)
        line.isShowingOriginal -> stringResource(R.string.call_transcript_show_translated)
        else -> stringResource(R.string.call_transcript_show_original)
    }
    val flip = { onToggleOriginal(line.key) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = if (line.canRevealOriginal) CALL_CAPTION_TARGET else CALL_CAPTION_ROW_MIN_HEIGHT)
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
            )
            .alpha(if (line.isFinal) 1f else 0.7f),
        verticalArrangement = Arrangement.Center,
    ) {
        if (showsTime) {
            CallCaptionStackedPhrase(line)
        } else {
            CallCaptionInlinePhrase(line, isWaiting = isWaiting, reduceMotion = reduceMotion)
        }
        CallCaptionOriginalBelow(line.originalBelow, reduceMotion)
    }
}

private val CALL_CAPTION_ROW_MIN_HEIGHT = 24.dp

/** A sentence that can be touched is a 48 dp target. */
private val CALL_CAPTION_TARGET = 48.dp

/** One `Text` for the sentence; it fades when its KIND changes (original, awaited, translated), never for a partial revision. */
@Composable
private fun CallCaptionInlinePhrase(line: CallLiveCaptionLine, isWaiting: Boolean, reduceMotion: Boolean) {
    val phase = rememberWaitingPhase(active = isWaiting && !reduceMotion)
    val speakerColor = remember(line.speakerId) { hexColor(CallSpeakerColor.hex(line.speakerId)) }
    AnimatedContent(
        targetState = line,
        contentKey = { it.kind() },
        transitionSpec = { fadeIn(tween(fadeMillis(reduceMotion))) togetherWith fadeOut(tween(fadeMillis(reduceMotion))) },
        label = "caption-sentence",
    ) { shown ->
        Text(
            text = CallCaptionSentence.text(
                line = shown,
                nameColor = speakerColor,
                textColor = captionInk(shown),
                dotAlphas = CallCaptionSentence.dotAlphas(phase).takeIf { isWaiting },
            ),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (shown.isFinal) FontWeight.Normal else FontWeight.Light,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** The journal keeps its header: the name and the hour, then the label, then the sentence. */
@Composable
private fun CallCaptionStackedPhrase(line: CallLiveCaptionLine) {
    val context = LocalContext.current
    val heading = "${line.speakerName} (${DateFormat.getTimeFormat(context).format(Date(line.capturedAtMs))})"
    val speakerColor = remember(line.speakerId) { hexColor(CallSpeakerColor.hex(line.speakerId)) }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
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
                    color = MeeshyMediaChromeColors.ChromeTertiary,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MeeshyMediaChromeColors.MediaFill)
                        .padding(horizontal = MeeshySpacing.xs, vertical = 1.dp),
                )
            }
        }
        Text(
            text = line.text,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (line.isFinal) FontWeight.Normal else FontWeight.Light,
            color = captionInk(line),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** « Original · … » under the translation, in secondary ink, indented: it unfolds from the sentence and folds back into it. */
@Composable
private fun CallCaptionOriginalBelow(original: String?, reduceMotion: Boolean) {
    val word = stringResource(R.string.call_captions_original)
    AnimatedContent(
        targetState = original,
        transitionSpec = { unfoldTransition(reduceMotion) },
        label = "caption-original",
    ) { shown ->
        if (shown != null) {
            Text(
                text = "$word · $shown",
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyMediaChromeColors.ChromeSecondary,
                modifier = Modifier.fillMaxWidth().padding(start = MeeshySpacing.md, top = MeeshySpacing.xxs),
            )
        }
    }
}

/** Opacity and translation only (iOS `.opacity.combined(with: .move(edge: .top))`); a short fade under Reduce motion. */
private fun unfoldTransition(reduceMotion: Boolean): ContentTransform {
    val fade = fadeMillis(reduceMotion)
    val enter: EnterTransition = if (reduceMotion) fadeIn(tween(fade)) else fadeIn(tween(fade)) + slideInVertically(tween(fade)) { -it }
    val exit: ExitTransition = if (reduceMotion) fadeOut(tween(fade)) else fadeOut(tween(fade)) + slideOutVertically(tween(fade)) { -it }
    return enter togetherWith exit
}

private fun fadeMillis(reduceMotion: Boolean): Int = if (reduceMotion) FADE_REDUCED_MS else FADE_MS

/** Only a TRANSLATED sentence takes its author's colour; an original stays in the ink of the call. */
private fun captionInk(line: CallLiveCaptionLine): Color =
    CallSpeakerColor.textHex(line.speakerId, servesTranslation = !line.isShowingOriginal)?.let { hexColor(it) } ?: Color.White

/** What makes two states of a line the SAME sentence being revised: only a change of kind fades. */
private fun CallLiveCaptionLine.kind(): List<Any?> = listOf(key, isShowingOriginal, servedLanguage, isAwaitingTranslation, originLanguage)

/** The lit dot of the three travels every 450 ms while a translation is awaited; null (still) otherwise. */
@Composable
private fun rememberWaitingPhase(active: Boolean): Int? {
    val phase by produceState<Int?>(null, active) {
        if (!active) {
            value = null
            return@produceState
        }
        var step = 0
        while (true) {
            value = step % 3
            step++
            delay(WAITING_STEP_MS)
        }
    }
    return phase
}
