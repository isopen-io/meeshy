package me.meeshy.ui.component.bubble

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.TranscriptionKaraokeResolver

/**
 * Le karaoké de la transcription d'un vocal dans la bulle (#13878) — iOS `AudioPlayerView.inlineFlowTranscription` :
 * pendant la lecture, le segment joué s'allume (gras, fond léger), ceux déjà dits restent lisibles, ceux à venir
 * s'estompent ; à l'arrêt, la transcription se lit d'un seul ton. Le segment allumé vient de
 * [TranscriptionKaraokeResolver], la loi partagée avec iOS.
 */
internal object BubbleAudioKaraoke {

    enum class Phase { Rest, Past, Active, Ahead }

    /**
     * L'état du karaoké à un instant. Deux positions dans le même segment donnent des cadres ÉGAUX : la transcription
     * ne se redessine qu'au changement de segment, pas à chaque relevé du lecteur.
     */
    @Immutable
    data class Frame(val phases: List<Phase>) {
        val activeIndex: Int? get() = phases.indexOf(Phase.Active).takeIf { it >= 0 }
    }

    @Immutable
    data class Palette(val rest: SpanStyle, val past: SpanStyle, val active: SpanStyle, val ahead: SpanStyle) {
        companion object {
            fun of(onColor: Color): Palette = Palette(
                rest = SpanStyle(color = onColor.copy(alpha = 0.75f)),
                past = SpanStyle(color = onColor.copy(alpha = 0.75f)),
                active = SpanStyle(color = onColor, fontWeight = FontWeight.Bold, background = onColor.copy(alpha = 0.15f)),
                ahead = SpanStyle(color = onColor.copy(alpha = 0.4f)),
            )
        }
    }

    fun frame(segments: List<MessageTranscriptionSegment>, playback: BubbleAudioPlayback?): Frame {
        if (playback == null || !playback.isPlaying) return Frame(List(segments.size) { Phase.Rest })
        val active = TranscriptionKaraokeResolver.activeSegmentIndex(
            segments = segments,
            currentTimeSeconds = playback.currentSeconds,
            progress = playback.progress.toDouble(),
            isPlaying = true,
        )
        val timed = isSeekable(segments)
        return Frame(
            segments.mapIndexed { index, segment ->
                when {
                    index == active -> Phase.Active
                    active != null -> if (index < active) Phase.Past else Phase.Ahead
                    timed && (segment.endTime ?: 0.0) <= playback.currentSeconds -> Phase.Past
                    else -> Phase.Ahead
                }
            },
        )
    }

    fun text(segments: List<MessageTranscriptionSegment>, frame: Frame, palette: Palette): AnnotatedString = buildAnnotatedString {
        segments.forEachIndexed { index, segment ->
            if (index > 0) append(' ')
            val style = when (frame.phases.getOrNull(index) ?: Phase.Rest) {
                Phase.Rest -> palette.rest
                Phase.Past -> palette.past
                Phase.Active -> palette.active
                Phase.Ahead -> palette.ahead
            }
            val start = length
            append(segment.text)
            addStyle(style, start, length)
        }
    }

    /** Un toucher ne déplace la lecture que si les segments portent leurs horodatages sur la piste jouée. */
    fun isSeekable(segments: List<MessageTranscriptionSegment>): Boolean =
        segments.any { (it.endTime ?: 0.0) > (it.startTime ?: 0.0) }

    /** Le début du segment sous le caractère [offset] ; l'espace qui suit un mot lui appartient. */
    fun seekSecondsAt(segments: List<MessageTranscriptionSegment>, offset: Int): Double? {
        if (!isSeekable(segments)) return null
        var end = 0
        segments.forEach { segment ->
            end += segment.text.length + 1
            if (offset < end) return segment.startTime ?: 0.0
        }
        return segments.lastOrNull()?.startTime
    }
}

/**
 * La transcription de la bulle, allumée au rythme de la lecture. [onSeek] n'est passé que pour le vocal chargé : un
 * toucher sur un mot y saute (iOS `player.seekToTime(segment.startTime)`), sinon le toucher revient à la bulle.
 */
@Composable
internal fun KaraokeTranscript(
    segments: List<MessageTranscriptionSegment>,
    frame: BubbleAudioKaraoke.Frame,
    onColor: Color,
    onSeek: ((Double) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val palette = remember(onColor) { BubbleAudioKaraoke.Palette.of(onColor) }
    val text = remember(segments, frame, palette) { BubbleAudioKaraoke.text(segments, frame, palette) }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val seek by rememberUpdatedState(onSeek)
    val seekable = onSeek != null && BubbleAudioKaraoke.isSeekable(segments)
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        maxLines = 3,
        overflow = TextOverflow.Ellipsis,
        onTextLayout = { layout = it },
        modifier = if (!seekable) modifier else modifier.pointerInput(segments) {
            // Seul un toucher BREF saute : l'appui long n'est pas consommé, il ouvre toujours le menu du message.
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false)
                val up = withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) { waitForUpOrCancellation() }
                    ?: return@awaitEachGesture
                val seconds = layout?.getOffsetForPosition(up.position)?.let { BubbleAudioKaraoke.seekSecondsAt(segments, it) }
                    ?: return@awaitEachGesture
                up.consume()
                seek?.invoke(seconds)
            }
        },
    )
}
