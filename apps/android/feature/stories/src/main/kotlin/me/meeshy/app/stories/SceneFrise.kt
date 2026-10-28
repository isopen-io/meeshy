package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerObjectChips
import me.meeshy.sdk.model.composer.timeline.ClipWindowResolver
import me.meeshy.sdk.model.composer.timeline.FriseBarDrag
import me.meeshy.sdk.model.composer.timeline.Plan2DTrack
import me.meeshy.sdk.model.composer.timeline.TimelineGeometry
import me.meeshy.sdk.model.composer.timeline.TrackBar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette

private val LABEL_LANE = 72.dp
private val HANDLE_HIT = 24.dp
private val ROW_HEIGHT = 34.dp

/** Ce que le doigt tient sur une barre : le corps entier, ou l'une de ses poignées. */
private typealias Grip = FriseBarDrag.Handle

/**
 * Le plan 2D de la scène (vue `1e`) : le temps se lit en pistes, une par objet, premier plan
 * d'abord. Toucher une piste choisit l'objet ET y pose la tête ; glisser sa barre la déplace,
 * tirer ses poignées allonge ou raccourcit son apparition, avec aimantation sur la tête et les
 * bords voisins. Le projet ne reçoit la fenêtre qu'au lâcher (une entrée d'annulation, pas une
 * par image) ; pendant le geste, seule la rangée tenue se recompose. La tête de lecture est
 * ambre. Le son se lit en pointillé : il existe pour le cadrage, pas pour l'édition.
 */
@Composable
internal fun SceneFrise(
    tracks: List<Plan2DTrack>,
    editableIds: Set<String>,
    selectedId: String?,
    slideDurationSeconds: Float,
    playheadSeconds: Float,
    onSelectTrack: (id: String, atSeconds: Float) -> Unit,
    onScrub: (Float) -> Unit,
    onWindow: (id: String, startSeconds: Float, durationSeconds: Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val duration = maxOf(slideDurationSeconds, ClipWindowResolver.MINIMUM_DURATION)
    var laneWidthPx by remember { mutableStateOf(0) }
    val haptics = rememberMeeshyHaptics()
    val panel = stringResource(R.string.composer_frise_panel)
    Column(
        modifier = modifier.fillMaxWidth().semantics { contentDescription = panel },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        FriseTransport(
            playheadSeconds = playheadSeconds,
            duration = duration,
            selected = tracks.firstOrNull { it.id == selectedId }?.takeIf { it.id in editableIds },
            onEntry = { selectedId?.let { onEntryAt(tracks, it, playheadSeconds, duration, onWindow) } },
            onExit = { selectedId?.let { onExitAt(tracks, it, playheadSeconds, duration, onWindow) } },
        )
        Box(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Ruler(duration = duration, onScrub = onScrub, onLaneWidth = { laneWidthPx = it })
                if (tracks.isEmpty()) {
                    Text(
                        text = stringResource(R.string.composer_frise_empty),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 4.dp),
                    )
                }
                tracks.forEach { track ->
                    androidx.compose.runtime.key(track.id) {
                        FriseTrackRow(
                            track = track,
                            editable = track.id in editableIds,
                            selected = track.id == selectedId,
                            allTracks = tracks,
                            duration = duration,
                            playheadSeconds = playheadSeconds,
                            laneWidthPx = laneWidthPx,
                            onSelect = { at ->
                                haptics.light()
                                onSelectTrack(track.id, at)
                            },
                            onCommit = { w -> onWindow(track.id, w.startSeconds, w.durationSeconds) },
                        )
                    }
                }
            }
            Playhead(playheadSeconds / duration, laneWidthPx)
        }
    }
}

@Composable
private fun FriseTransport(
    playheadSeconds: Float,
    duration: Float,
    selected: Plan2DTrack?,
    onEntry: () -> Unit,
    onExit: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "${ComposerObjectChips.timecode(playheadSeconds.toDouble())} / ${ComposerObjectChips.timecode(duration.toDouble())}",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.weight(1f),
        )
        if (selected != null) {
            TextChip(stringResource(R.string.composer_frise_entry), onEntry)
            TextChip(stringResource(R.string.composer_frise_exit), onExit)
        }
    }
}

@Composable
private fun TextChip(label: String, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Box(
        modifier = Modifier
            .height(44.dp)
            .clickable {
                haptics.light()
                onClick()
            }
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun Ruler(duration: Float, onScrub: (Float) -> Unit, onLaneWidth: (Int) -> Unit) {
    val label = stringResource(R.string.composer_frise_ruler)
    val currentScrub by rememberUpdatedState(onScrub)
    Box(
        modifier = Modifier.fillMaxWidth().height(24.dp).padding(start = LABEL_LANE),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp)
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f), RoundedCornerShape(7.dp))
                .onSizeChanged { onLaneWidth(it.width) }
                .semantics { contentDescription = label }
                .pointerInput(duration) {
                    detectTapGestures { currentScrub((it.x / size.width).coerceIn(0f, 1f) * duration) }
                }
                .pointerInput(duration) {
                    detectDragGestures { change, _ ->
                        change.consume()
                        currentScrub((change.position.x / size.width).coerceIn(0f, 1f) * duration)
                    }
                },
        )
    }
}

@Composable
private fun Playhead(fraction: Float, laneWidthPx: Int) {
    Box(
        modifier = Modifier
            .fillMaxHeight()
            .width(2.dp)
            .offset { IntOffset(LABEL_LANE.roundToPx() + (fraction.coerceIn(0f, 1f) * laneWidthPx).roundToInt() - 1, 0) }
            .background(MeeshyPalette.Warning),
    )
}

@Composable
private fun FriseTrackRow(
    track: Plan2DTrack,
    editable: Boolean,
    selected: Boolean,
    allTracks: List<Plan2DTrack>,
    duration: Float,
    playheadSeconds: Float,
    laneWidthPx: Int,
    onSelect: (Float) -> Unit,
    onCommit: (FriseBarDrag.Stored) -> Unit,
) {
    val stored = when (val bar = track.bar) {
        is TrackBar.Timed -> ClipWindowResolver.Window(bar.start.toFloat(), (bar.end - bar.start).toFloat())
        TrackBar.Ghost -> ClipWindowResolver.Window(0f, duration)
    }
    var live by remember(track.id) { mutableStateOf<ClipWindowResolver.Window?>(null) }
    val window = live ?: stored
    val geometry = remember(laneWidthPx, duration) {
        TimelineGeometry(zoomScale = laneWidthPx / (TimelineGeometry.BASE_PIXELS_PER_SECOND * duration))
    }
    val candidates = remember(allTracks, track.id, playheadSeconds, duration) {
        FriseBarDrag.candidates(allTracks, track.id, playheadSeconds, duration)
    }
    val currentStored by rememberUpdatedState(stored)
    val currentCandidates by rememberUpdatedState(candidates)
    val currentSelect by rememberUpdatedState(onSelect)
    val currentPlayhead by rememberUpdatedState(playheadSeconds)
    val currentCommit by rememberUpdatedState(onCommit)
    val dragEnabled = editable && laneWidthPx > 0
    Row(
        modifier = Modifier.fillMaxWidth().height(ROW_HEIGHT),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = track.label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(LABEL_LANE - 8.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f), RoundedCornerShape(4.dp))
                .pointerInput(track.id, duration) {
                    detectTapGestures { currentSelect((it.x / size.width).coerceIn(0f, 1f) * duration) }
                },
        ) {
            val barColor = when {
                selected -> MaterialTheme.colorScheme.primary
                editable -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f)
                else -> Color.Transparent
            }
            val dashColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f)
            Box(
                modifier = Modifier
                    .offset { IntOffset(((window.start / duration) * laneWidthPx).roundToInt(), 0) }
                    .width(with(androidx.compose.ui.platform.LocalDensity.current) { ((window.duration / duration) * laneWidthPx).coerceAtLeast(4f).toDp() })
                    .fillMaxHeight()
                    .padding(vertical = 4.dp)
                    .background(barColor, RoundedCornerShape(4.dp))
                    .then(if (editable) Modifier else Modifier.drawBehind { dashedOutline(dashColor) })
                    .then(
                        if (dragEnabled) {
                            Modifier.dragBar(track.id, Grip.BODY, geometry, { currentStored }, { currentCandidates }, { live = it }, {
                                live = null
                                currentCommit(FriseBarDrag.stored(it, duration))
                            }, onStart = { currentSelect(currentPlayhead) })
                        } else {
                            Modifier
                        },
                    ),
            )
            if (selected && dragEnabled) {
                Handle(window.start, duration, laneWidthPx, Grip.START) { grip ->
                    Modifier.dragBar(track.id, grip, geometry, { currentStored }, { currentCandidates }, { live = it }, {
                        live = null
                        currentCommit(FriseBarDrag.stored(it, duration))
                    })
                }
                Handle(window.end, duration, laneWidthPx, Grip.END) { grip ->
                    Modifier.dragBar(track.id, grip, geometry, { currentStored }, { currentCandidates }, { live = it }, {
                        live = null
                        currentCommit(FriseBarDrag.stored(it, duration))
                    })
                }
            }
        }
    }
}

@Composable
private fun Handle(at: Float, duration: Float, laneWidthPx: Int, grip: Grip, drag: (Grip) -> Modifier) {
    Box(
        modifier = Modifier
            .offset { IntOffset(((at / duration) * laneWidthPx).roundToInt() - HANDLE_HIT.roundToPx() / 2, 0) }
            .width(HANDLE_HIT)
            .fillMaxHeight()
            .then(drag(grip)),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.width(4.dp).height(18.dp).background(Color.White, RoundedCornerShape(2.dp)))
    }
}

private fun Modifier.dragBar(
    key: Any,
    grip: Grip,
    geometry: TimelineGeometry,
    from: () -> ClipWindowResolver.Window,
    candidates: () -> List<me.meeshy.sdk.model.composer.timeline.SnapCandidate>,
    onLive: (ClipWindowResolver.Window) -> Unit,
    onEnd: (ClipWindowResolver.Window) -> Unit,
    onStart: () -> Unit = {},
): Modifier = pointerInput(key, grip, geometry) {
    var origin = from()
    var total = 0f
    var latest = origin
    detectDragGestures(
        onDragStart = {
            origin = from()
            total = 0f
            latest = origin
            onStart()
        },
        onDrag = { change, amount ->
            change.consume()
            total += amount.x
            latest = FriseBarDrag.resolve(grip, origin, total, geometry, candidates())
            onLive(latest)
        },
        onDragEnd = { onEnd(latest) },
        onDragCancel = { onEnd(origin) },
    )
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.dashedOutline(color: Color) {
    drawRect(
        color = color,
        topLeft = Offset.Zero,
        size = Size(size.width, size.height),
        style = Stroke(width = 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))),
    )
}

private fun onEntryAt(
    tracks: List<Plan2DTrack>,
    id: String,
    at: Float,
    duration: Float,
    onWindow: (String, Float, Float) -> Unit,
) {
    val (start, end) = barOf(tracks, id, duration)
    val window = ClipWindowResolver.resolve(ClipWindowResolver.Edit.SetStart(at), ClipWindowResolver.Window(start, end - start))
    FriseBarDrag.stored(window, duration).let { onWindow(id, it.startSeconds, it.durationSeconds) }
}

private fun onExitAt(
    tracks: List<Plan2DTrack>,
    id: String,
    at: Float,
    duration: Float,
    onWindow: (String, Float, Float) -> Unit,
) {
    val (start, end) = barOf(tracks, id, duration)
    val window = ClipWindowResolver.resolve(ClipWindowResolver.Edit.SetEnd(at), ClipWindowResolver.Window(start, end - start))
    FriseBarDrag.stored(window, duration).let { onWindow(id, it.startSeconds, it.durationSeconds) }
}

private fun barOf(tracks: List<Plan2DTrack>, id: String, duration: Float): Pair<Float, Float> =
    when (val bar = tracks.firstOrNull { it.id == id }?.bar) {
        is TrackBar.Timed -> bar.start.toFloat() to bar.end.toFloat()
        else -> 0f to duration
    }
