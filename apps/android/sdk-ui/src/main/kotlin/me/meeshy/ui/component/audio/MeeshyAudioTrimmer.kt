package me.meeshy.ui.component.audio

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalLayoutDirection
import me.meeshy.sdk.model.audioedit.AudioTrimGeometry
import me.meeshy.sdk.model.waveform.WaveformReading
import me.meeshy.sdk.model.waveform.WaveformResolution
import me.meeshy.ui.R
import me.meeshy.ui.component.media.rememberMediaKindStrings

/** Constantes du rogneur. */
public object MeeshyAudioTrimmerDefaults {
    /** Compartiments de l'onde : la même échelle d'affichage que le lecteur de transcription. */
    public const val WAVEFORM_BUCKETS: Int = WaveformResolution.TRANSCRIPT
    public val StripHeight = 72.dp
    public val PlayButtonSize = 48.dp
}

private enum class TrimHandle { START, END }

/** La borne la plus récente, posée dès le geste : le relâchement ne dépend pas d'une recomposition encore en vol. */
private class LiveRange(var value: ClosedFloatingPointRange<Double>)

/**
 * **Le rognage d'un son — bande défilante, curseur au centre, poignées larges** (miroir de
 * `MeeshyAudioTrimmer`, iOS).
 *
 * La bande DÉFILE sous un curseur FIXE posé au centre ; le pincement change le temps visible (zoom 1 à 40)
 * donc la précision. Le bouton de lecture est de taille fixe, la bande prend LE RESTE mesuré dans la Row :
 * rien ne peut déborder. Tout est clippé à la bande ; une poignée hors champ est ramenée au bord avec une flèche.
 *
 * [samples] = la mesure brute (RMS absolu) à [MeeshyAudioTrimmerDefaults.WAVEFORM_BUCKETS] compartiments.
 * L'hôte a chargé la source dans [player] (`player.load(uri)`).
 */
@Composable
public fun MeeshyAudioTrimmer(
    samples: List<Float>,
    duration: Double,
    range: ClosedFloatingPointRange<Double>,
    onRangeChange: (ClosedFloatingPointRange<Double>) -> Unit,
    player: AudioTrimPreviewPlayer,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val playing by player.isPlaying.collectAsState()
    val playhead by player.playhead.collectAsState()
    val live = remember { LiveRange(range) }
    live.value = range
    val changeRange by rememberUpdatedState(onRangeChange)
    var zoom by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableFloatStateOf(0f) }
    var stripWidth by remember { mutableFloatStateOf(1f) }
    var dragged by remember { mutableStateOf<TrimHandle?>(null) }
    val geometry = AudioTrimGeometry(duration, stripWidth, zoom)

    LaunchedEffect(duration) {
        if (duration <= 0.0) return@LaunchedEffect
        val clamped = AudioTrimGeometry(duration, stripWidth, 1f).clampedRange(live.value)
        changeRange(clamped)
        offset = 0f
        live.value = clamped
        player.play(clamped.start, clamped.endInclusive)
    }
    LaunchedEffect(playhead, playing) {
        if (playing && dragged == null) offset = geometry.offsetCentering(playhead)
    }

    Row(
        modifier.fillMaxWidth().height(MeeshyAudioTrimmerDefaults.StripHeight),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlayButton(
            playing = playing,
            accent = accent,
            onClick = { if (playing) player.pause() else player.play(range.start, range.endInclusive) },
        )
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Box(Modifier.weight(1f).fillMaxHeight().onSizeChanged { stripWidth = it.width.toFloat().coerceAtLeast(1f) }) {
                val spoken = rememberMediaKindStrings()
                val stripLabel = stringResource(R.string.audio_trim_strip)
                val startLabel = stringResource(R.string.audio_trim_handle_start)
                val endLabel = stringResource(R.string.audio_trim_handle_end)
                Box(
                    Modifier
                        .fillMaxWidth()
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(12.dp))
                        .background(accent.copy(alpha = 0.10f))
                        .semantics { contentDescription = stripLabel }
                        .pointerInput(duration) {
                            detectTransformGestures { _, pan, gestureZoom, _ ->
                                player.pause()
                                if (gestureZoom != 1f) {
                                    val (next, nextOffset) = AudioTrimGeometry(duration, stripWidth, zoom).zoomed(zoom * gestureZoom, offset)
                                    zoom = next.zoom
                                    offset = nextOffset
                                }
                                val g = AudioTrimGeometry(duration, stripWidth, zoom)
                                offset = g.clampedOffset(offset - pan.x)
                                player.seek(g.time(stripWidth / 2f, offset))
                            }
                        },
                ) {
                    TrimWaveform(samples, geometry, offset, range, accent)
                    TrimHandleFor(
                        which = TrimHandle.START,
                        label = startLabel,
                        instant = range.start,
                        geometry = geometry,
                        offset = offset,
                        stripWidth = stripWidth,
                        accent = accent,
                        spoken = { spoken.spokenDuration(it).orEmpty() },
                        onGrab = { dragged = it; player.pause() },
                        onMove = { x ->
                            val t = geometry.time(x, offset)
                            live.value = geometry.movedStart(t, live.value.endInclusive)..live.value.endInclusive
                            changeRange(live.value)
                        },
                        onRelease = {
                            dragged = null
                            player.play(live.value.start, live.value.endInclusive)
                        },
                    )
                    TrimHandleFor(
                        which = TrimHandle.END,
                        label = endLabel,
                        instant = range.endInclusive,
                        geometry = geometry,
                        offset = offset,
                        stripWidth = stripWidth,
                        accent = accent,
                        spoken = { spoken.spokenDuration(it).orEmpty() },
                        onGrab = { dragged = it; player.pause() },
                        onMove = { x ->
                            val t = geometry.time(x, offset)
                            live.value = live.value.start..geometry.movedEnd(t, live.value.start)
                            changeRange(live.value)
                        },
                        onRelease = {
                            dragged = null
                            player.play(live.value.start, live.value.endInclusive)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayButton(playing: Boolean, accent: Color, onClick: () -> Unit) {
    val label = stringResource(if (playing) R.string.audio_trim_stop else R.string.audio_trim_play)
    Box(
        Modifier
            .size(MeeshyAudioTrimmerDefaults.PlayButtonSize)
            .clip(CircleShape)
            .background(accent)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(if (playing) MeeshyIcons.Stop else MeeshyIcons.Play, null, tint = Color.White)
    }
}

@Composable
private fun TrimHandleFor(
    which: TrimHandle,
    label: String,
    instant: Double,
    geometry: AudioTrimGeometry,
    offset: Float,
    stripWidth: Float,
    accent: Color,
    spoken: (Double) -> String,
    onGrab: (TrimHandle) -> Unit,
    onMove: (Float) -> Unit,
    onRelease: () -> Unit,
) {
    AudioTrimHandle(
        rawX = geometry.x(instant, offset),
        stripWidthPx = stripWidth,
        label = label,
        spokenValue = spoken(instant),
        tint = accent,
        onDragStart = { onGrab(which) },
        onDragTo = onMove,
        onDragEnd = onRelease,
    )
}

@Composable
private fun TrimWaveform(
    samples: List<Float>,
    geometry: AudioTrimGeometry,
    offset: Float,
    range: ClosedFloatingPointRange<Double>,
    accent: Color,
) {
    Canvas(Modifier.fillMaxWidth().fillMaxHeight()) {
        val barWidth = 3.dp.toPx()
        val step = barWidth + 1.dp.toPx()
        val mid = size.height / 2f
        if (samples.isNotEmpty()) {
            var x = 0f
            while (x < size.width) {
                val t = geometry.time(x, offset)
                val index = (t / geometry.duration * samples.size).toInt().coerceIn(0, samples.size - 1)
                val h = WaveformReading.MEASURED.height(samples[index]) * (size.height - 10.dp.toPx())
                val inside = t >= range.start && t <= range.endInclusive
                val barHeight = maxOf(2.dp.toPx(), h)
                drawRoundRect(
                    color = if (inside) accent else accent.copy(alpha = 0.22f),
                    topLeft = Offset(x, mid - barHeight / 2f),
                    size = Size(barWidth, barHeight),
                    cornerRadius = CornerRadius(barWidth / 2f),
                )
                x += step
            }
        }
        val scrim = Color.Black.copy(alpha = 0.40f)
        val startX = geometry.x(range.start, offset).coerceIn(0f, size.width)
        val endX = geometry.x(range.endInclusive, offset).coerceIn(0f, size.width)
        if (startX > 0f) drawRect(scrim, Offset.Zero, Size(startX, size.height))
        if (endX < size.width) drawRect(scrim, Offset(endX, 0f), Size(size.width - endX, size.height))
        val cursorWidth = 2.dp.toPx()
        drawRect(Color.White.copy(alpha = 0.9f), Offset(size.width / 2f - cursorWidth / 2f, 0f), Size(cursorWidth, size.height))
    }
}
