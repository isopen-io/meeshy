package me.meeshy.app.stories

import androidx.compose.foundation.background
import me.meeshy.sdk.model.composer.sound.SoundTraceBars
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerLimitNotice
import me.meeshy.sdk.model.composer.ComposerObjectChips
import me.meeshy.sdk.model.composer.timeline.ClipWindowResolver
import me.meeshy.sdk.model.composer.timeline.FriseBarDrag
import me.meeshy.sdk.model.composer.timeline.FriseRuler
import me.meeshy.sdk.model.composer.timeline.FriseViewport
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
 * ambre. Chaque objet posé a sa piste réglable, quelle que soit sa famille (#13904) ; un fond ou le son d'ambiance se
 * lisent en pointillé : ils durent la slide.
 */
@Composable
internal fun SceneFrise(
    tracks: List<Plan2DTrack>,
    labels: Map<String, String> = emptyMap(),
    editableIds: Set<String>,
    selectedId: String?,
    slideDurationSeconds: Float,
    playheadSeconds: Float,
    onSelectTrack: (id: String, atSeconds: Float) -> Unit,
    onScrub: (Float) -> Unit,
    onWindow: (id: String, startSeconds: Float, durationSeconds: Float) -> Unit,
    modifier: Modifier = Modifier,
    splittableIds: Set<String> = emptySet(),
    onSplit: (id: String) -> Unit = {},
    visuals: Map<String, FriseBarVisual> = emptyMap(),
    onDuplicate: (id: String) -> Unit = {},
    onRemove: (id: String) -> Unit = {},
) {
    val duration = maxOf(slideDurationSeconds, ClipWindowResolver.MINIMUM_DURATION)
    var laneWidthPx by remember { mutableStateOf(0) }
    // La portion du temps montrée (#13481, iso iOS #14213) : `null`, la slide entière ; pincer la resserre autour de la tête.
    var zoom by remember { mutableStateOf<FriseViewport?>(null) }
    val view = (zoom ?: FriseViewport.whole(duration)).clamped(duration)
    var playing by remember { mutableStateOf(false) }
    val currentPlayhead by rememberUpdatedState(playheadSeconds)
    val currentScrub by rememberUpdatedState(onScrub)
    // **Lire la scène** : la tête avance au rythme de l'horloge d'affichage, s'arrête à la fin ; la frise zoomée la suit.
    LaunchedEffect(playing, duration) {
        if (!playing) return@LaunchedEffect
        if (currentPlayhead >= duration) currentScrub(0f)
        var last = withFrameNanos { it }
        while (playing) {
            withFrameNanos { now ->
                val next = FriseViewport.advanced(currentPlayhead, (now - last) / 1_000_000_000f, duration)
                last = now
                currentScrub(next)
                zoom = zoom?.clamped(duration)?.showing(next, duration)
                if (next >= duration) playing = false
            }
        }
    }
    val haptics = rememberMeeshyHaptics()
    val panel = stringResource(R.string.composer_frise_panel)
    val interfaceDirection = LocalLayoutDirection.current
    Column(
        modifier = modifier.fillMaxWidth().semantics { contentDescription = panel },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        FriseTransport(
            playing = playing,
            onPlayPause = { playing = !playing },
            playheadSeconds = playheadSeconds,
            duration = duration,
            selected = tracks.firstOrNull { it.id == selectedId }?.takeIf { it.id in editableIds },
            onEntry = { selectedId?.let { onEntryAt(tracks, it, playheadSeconds, duration, onWindow) } },
            onExit = { selectedId?.let { onExitAt(tracks, it, playheadSeconds, duration, onWindow) } },
            canSplit = selectedId != null && selectedId in splittableIds &&
                barOf(tracks, selectedId, duration).let { (s, e) ->
                    FriseBarDrag.canSplit(ClipWindowResolver.Window(s, e - s), playheadSeconds)
                },
            onSplit = { selectedId?.let(onSplit) },
            onDuplicate = { selectedId?.let(onDuplicate) },
            onRemove = { selectedId?.let(onRemove) },
        )
        // L'axe du temps se lit de gauche à droite dans toutes les langues (#14219) : en RTL, `offset` est miroité mais
        // la position du doigt ne l'est pas — la tête et les barres fuyaient le doigt. Les noms gardent l'interface.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier = Modifier.fillMaxWidth().pinchToZoom { scale, panPx ->
                val zoomed = view.zoomed(scale, currentPlayhead, duration)
                val panned = if (laneWidthPx > 0) zoomed.panned(panPx / laneWidthPx, duration) else zoomed
                zoom = panned.takeIf { it.span < duration }
            },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Ruler(view = view, duration = duration, zoomed = zoom != null, onScrub = onScrub, onLaneWidth = { laneWidthPx = it })
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
                            label = labels[track.id] ?: track.label,
                            editable = track.id in editableIds,
                            selected = track.id == selectedId,
                            allTracks = tracks,
                            duration = duration,
                            view = view,
                            visual = visuals[track.id],
                            onPan = { fraction -> if (zoom != null) zoom = view.panned(fraction, duration) },
                            playheadSeconds = playheadSeconds,
                            laneWidthPx = laneWidthPx,
                            labelDirection = interfaceDirection,
                            onSnap = haptics::light,
                            onSelect = { at ->
                                haptics.light()
                                onSelectTrack(track.id, at)
                            },
                            onCommit = { w -> onWindow(track.id, w.startSeconds, w.durationSeconds) },
                        )
                    }
                }
            }
            Playhead(view.fraction(playheadSeconds), laneWidthPx)
        }
        }
    }
}

@Composable
private fun FriseTransport(
    playing: Boolean,
    onPlayPause: () -> Unit,
    playheadSeconds: Float,
    duration: Float,
    selected: Plan2DTrack?,
    onEntry: () -> Unit,
    onExit: () -> Unit,
    canSplit: Boolean,
    onSplit: () -> Unit,
    onDuplicate: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PlayPauseButton(playing, onPlayPause)
        // L'horloge ne dit rien tant que la tête n'a pas quitté le début (#13838) ; sa place reste réservée, la frise ne saute pas.
        val clock = ComposerLimitNotice.showsPlanClock(playheadSeconds)
        Text(
            text = "${ComposerObjectChips.timecode(playheadSeconds.toDouble())} / ${ComposerObjectChips.timecode(duration.toDouble())}",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier
                .weight(1f)
                .graphicsLayer { alpha = if (clock) 1f else 0f }
                .then(if (clock) Modifier else Modifier.clearAndSetSemantics {}),
        )
        if (selected != null) {
            TextChip(stringResource(R.string.composer_frise_entry), onEntry)
            TextChip(stringResource(R.string.composer_frise_exit), onExit)
            if (canSplit) TextChip(stringResource(R.string.composer_object_editor_split), onSplit)
            // Dupliquer et Retirer l'objet choisi sans quitter la frise (#14221) : un pas d'annulation chacun.
            GlyphChip(MeeshyIcons.Copy, stringResource(R.string.story_canvas_action_duplicate), onDuplicate)
            GlyphChip(MeeshyIcons.Delete, stringResource(R.string.composer_selection_remove), onRemove)
        }
    }
}

@Composable
private fun GlyphChip(glyph: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Box(
        modifier = Modifier
            .size(44.dp)
            .clickable {
                haptics.light()
                onClick()
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(glyph, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
    }
}

/** Lecture / pause de la scène (iso iOS : un disque blanc de 36 dp dans une cible de 44). */
@Composable
private fun PlayPauseButton(playing: Boolean, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(if (playing) R.string.composer_frise_pause else R.string.composer_frise_play)
    Box(
        modifier = Modifier
            .size(44.dp)
            .clickable {
                haptics.light()
                onClick()
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(36.dp).background(Color.White, CircleShape), contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (playing) MeeshyIcons.Pause else MeeshyIcons.Play,
                contentDescription = null,
                tint = Color.Black.copy(alpha = 0.9f),
            )
        }
    }
}

/**
 * **Deux doigts zooment et font défiler la frise** (#13481) : lus AVANT les barres, pour qu'un pincement ne devienne
 * jamais le glissé d'une barre ; un seul doigt reste aux barres, aux poignées et à la règle.
 */
private fun Modifier.pinchToZoom(onTransform: (scale: Float, panPx: Float) -> Unit): Modifier = pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        do {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            if (event.changes.count { it.pressed } >= 2) {
                val scale = event.calculateZoom()
                val pan = event.calculatePan().x
                if (scale != 1f || pan != 0f) onTransform(scale, pan)
                event.changes.forEach { it.consume() }
            }
        } while (event.changes.any { it.pressed })
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

/**
 * La règle GRADUÉE (#14218, iso iOS) : des graduations au pas lisible de [FriseRuler], leur temps écrit au-dessus,
 * dessinées en une seule passe ; le doigt sent la tête franchir une graduation majeure.
 */
@Composable
private fun Ruler(view: FriseViewport, duration: Float, zoomed: Boolean, onScrub: (Float) -> Unit, onLaneWidth: (Int) -> Unit) {
    val label = stringResource(R.string.composer_frise_ruler)
    val currentScrub by rememberUpdatedState(onScrub)
    val haptics = rememberMeeshyHaptics()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val ink = MaterialTheme.colorScheme.onSurface
    val labelStyle = TextStyle(fontSize = 9.sp, color = ink.copy(alpha = 0.6f))
    var widthPx by remember { mutableStateOf(0) }
    val widthDp = with(density) { widthPx.toDp().value }
    val ticks = remember(view, widthDp) { FriseRuler.ticks(view, widthDp) }
    val majorStep = remember(view.span, widthDp) { FriseRuler.majorStep(view.span, widthDp) }
    val currentView by rememberUpdatedState(view)
    Box(
        modifier = Modifier.fillMaxWidth().height(24.dp).padding(start = LABEL_LANE),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .onSizeChanged {
                    widthPx = it.width
                    onLaneWidth(it.width)
                }
                .drawBehind {
                    ticks.forEach { tick ->
                        val x = view.fraction(tick.time).coerceIn(0f, 1f) * size.width
                        val h = (if (tick.isMajor) 7.dp else 4.dp).toPx()
                        drawRect(
                            color = ink.copy(alpha = if (tick.isMajor) 0.55f else 0.25f),
                            topLeft = Offset((x - 0.5f).coerceIn(0f, size.width - 1f), size.height - h),
                            size = Size(1.dp.toPx(), h),
                        )
                        tick.label?.let { text ->
                            val layout = measurer.measure(text, labelStyle)
                            val left = (x - layout.size.width / 2f).coerceIn(0f, maxOf(0f, size.width - layout.size.width))
                            drawText(layout, topLeft = Offset(left, 0f))
                        }
                    }
                    // L'ascenseur : où la fenêtre zoomée se tient dans la slide.
                    if (zoomed && duration > 0f) {
                        val h = 1.5.dp.toPx()
                        drawRect(
                            color = ink.copy(alpha = 0.8f),
                            topLeft = Offset(view.start / duration * size.width, size.height - h),
                            size = Size(maxOf(6.dp.toPx(), view.span / duration * size.width), h),
                        )
                    }
                }
                .semantics { contentDescription = label }
                .pointerInput(duration) {
                    detectTapGestures { currentScrub(currentView.timeAt(it.x / size.width)) }
                }
                .pointerInput(duration, majorStep) {
                    var last: Float? = null
                    detectDragGestures(
                        onDragStart = { last = null },
                        onDragEnd = { last = null },
                        onDragCancel = { last = null },
                    ) { change, _ ->
                        change.consume()
                        val at = currentView.timeAt(change.position.x / size.width)
                        last?.let { if (FriseRuler.crossesMajor(it, at, majorStep)) haptics.light() }
                        last = at
                        currentScrub(at)
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
            .graphicsLayer { alpha = if (fraction in 0f..1f) 1f else 0f }
            .background(MeeshyPalette.Warning),
    )
}

@Composable
private fun FriseTrackRow(
    track: Plan2DTrack,
    label: String,
    editable: Boolean,
    selected: Boolean,
    allTracks: List<Plan2DTrack>,
    duration: Float,
    view: FriseViewport,
    visual: FriseBarVisual?,
    onPan: (Float) -> Unit,
    playheadSeconds: Float,
    laneWidthPx: Int,
    labelDirection: LayoutDirection,
    onSnap: () -> Unit,
    onSelect: (Float) -> Unit,
    onCommit: (FriseBarDrag.Stored) -> Unit,
) {
    val stored = when (val bar = track.bar) {
        is TrackBar.Timed -> ClipWindowResolver.Window(bar.start.toFloat(), (bar.end - bar.start).toFloat())
        TrackBar.Ghost -> ClipWindowResolver.Window(0f, duration)
    }
    var live by remember(track.id) { mutableStateOf<ClipWindowResolver.Window?>(null) }
    val window = live ?: stored
    val geometry = remember(laneWidthPx, view.span) {
        TimelineGeometry(zoomScale = laneWidthPx / (TimelineGeometry.BASE_PIXELS_PER_SECOND * view.span))
    }
    val currentView by rememberUpdatedState(view)
    val currentPan by rememberUpdatedState(onPan)
    val candidates = remember(allTracks, track.id, playheadSeconds, duration) {
        FriseBarDrag.candidates(allTracks, track.id, playheadSeconds, duration)
    }
    val currentStored by rememberUpdatedState(stored)
    val currentCandidates by rememberUpdatedState(candidates)
    val currentSelect by rememberUpdatedState(onSelect)
    val currentPlayhead by rememberUpdatedState(playheadSeconds)
    val currentCommit by rememberUpdatedState(onCommit)
    val currentSnap by rememberUpdatedState(onSnap)
    val dragEnabled = editable && laneWidthPx > 0
    val actions = friseTrackActions(editable, window, duration) { currentCommit(it) }
    val windowText = "${ComposerObjectChips.timecode(window.start.toDouble())} – ${ComposerObjectChips.timecode(window.end.toDouble())}"
    Row(
        modifier = Modifier.fillMaxWidth().height(ROW_HEIGHT).semantics(mergeDescendants = true) {
            this.selected = selected
            stateDescription = windowText
            customActions = actions
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalLayoutDirection provides labelDirection) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.width(LABEL_LANE - 8.dp),
            )
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .clipToBounds()
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f), RoundedCornerShape(4.dp))
                .pointerInput(track.id, duration) {
                    detectTapGestures { currentSelect(currentView.timeAt(it.x / size.width)) }
                }
                // Glisser le fond d'une piste fait défiler la frise zoomée.
                .pointerInput(track.id) {
                    detectHorizontalDragGestures { change, amount ->
                        if (size.width > 0) currentPan(amount / size.width)
                        change.consume()
                    }
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
                    .offset { IntOffset((view.fraction(window.start) * laneWidthPx).roundToInt(), 0) }
                    .width(with(androidx.compose.ui.platform.LocalDensity.current) { ((window.duration / view.span) * laneWidthPx).coerceAtLeast(4f).toDp() })
                    .fillMaxHeight()
                    .padding(vertical = 4.dp)
                    .background(barColor, RoundedCornerShape(4.dp))
                    .then(if (editable) Modifier else Modifier.drawBehind { dashedOutline(dashColor) })
                    .then(
                        if (dragEnabled) {
                            Modifier.dragBar(track.id, Grip.BODY, geometry, { currentStored }, { currentCandidates }, { live = it }, {
                                live = null
                                currentCommit(FriseBarDrag.stored(it, duration))
                            }, onStart = { currentSelect(currentPlayhead) }, onSnap = { currentSnap() })
                        } else {
                            Modifier
                        },
                    ),
            ) {
                visual?.let { FriseBarContent(it) }
            }
            if (selected && dragEnabled) {
                Handle(view.fraction(window.start), laneWidthPx, Grip.START) { grip ->
                    Modifier.dragBar(track.id, grip, geometry, { currentStored }, { currentCandidates }, { live = it }, {
                        live = null
                        currentCommit(FriseBarDrag.stored(it, duration))
                    }, onSnap = { currentSnap() })
                }
                Handle(view.fraction(window.end), laneWidthPx, Grip.END) { grip ->
                    Modifier.dragBar(track.id, grip, geometry, { currentStored }, { currentCandidates }, { live = it }, {
                        live = null
                        currentCommit(FriseBarDrag.stored(it, duration))
                    }, onSnap = { currentSnap() })
                }
            }
        }
    }
}

/** Les vignettes d'une vidéo ou la forme d'onde d'un son, dans leur barre (#14220) ; jamais une cible de toucher. */
@Composable
private fun FriseBarContent(visual: FriseBarVisual) {
    when (visual) {
        is FriseBarVisual.Filmstrip -> {
            val frames = rememberVideoFrames(visual.url, visual.sourceSeconds)
            Row(Modifier.fillMaxSize().clip(RoundedCornerShape(4.dp)).graphicsLayer { alpha = 0.85f }) {
                frames.forEach { frame ->
                    Image(
                        bitmap = frame,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
        }
        is FriseBarVisual.Waveform -> {
            val bars = remember(visual.samples) { SoundTraceBars.heights(visual.samples, FRISE_WAVE_BARS) }
            Canvas(Modifier.fillMaxSize().padding(horizontal = 3.dp)) {
                val step = size.width / FRISE_WAVE_BARS
                val barWidth = step * 0.55f
                bars.forEachIndexed { i, fraction ->
                    val h = size.height * fraction
                    drawRoundRect(
                        color = Color.White.copy(alpha = 0.8f),
                        topLeft = Offset(i * step + (step - barWidth) / 2, (size.height - h) / 2),
                        size = Size(barWidth, h),
                        cornerRadius = CornerRadius(barWidth / 2),
                    )
                }
            }
        }
    }
}

private const val FRISE_WAVE_BARS = 48

/**
 * Ce que TalkBack offre sur une piste réglable (#14222, iso iOS) : la déplacer, avancer ou reculer son entrée et sa
 * sortie d'un demi-pas de seconde. Une poignée ne se saisit pas au lecteur d'écran ; ces six pas la remplacent.
 */
@Composable
private fun friseTrackActions(
    editable: Boolean,
    window: ClipWindowResolver.Window,
    duration: Float,
    commit: (FriseBarDrag.Stored) -> Unit,
): List<CustomAccessibilityAction> {
    if (!editable) return emptyList()
    val step = FRISE_ACCESSIBILITY_STEP
    val edits = listOf(
        R.string.composer_frise_earlier to ClipWindowResolver.Edit.Move(window.start - step),
        R.string.composer_frise_later to ClipWindowResolver.Edit.Move(window.start + step),
        R.string.composer_frise_entryEarlier to ClipWindowResolver.Edit.SetStart(window.start - step),
        R.string.composer_frise_entryLater to ClipWindowResolver.Edit.SetStart(window.start + step),
        R.string.composer_frise_exitEarlier to ClipWindowResolver.Edit.SetEnd(window.end - step),
        R.string.composer_frise_exitLater to ClipWindowResolver.Edit.SetEnd(window.end + step),
    )
    return edits.map { (label, edit) ->
        CustomAccessibilityAction(stringResource(label)) {
            commit(FriseBarDrag.stored(withinSlide(edit, ClipWindowResolver.resolve(edit, window), duration), duration))
            true
        }
    }
}

/** La fenêtre reste dans la slide : un déplacement garde sa durée, une sortie ne dépasse pas la fin. */
private fun withinSlide(
    edit: ClipWindowResolver.Edit,
    window: ClipWindowResolver.Window,
    duration: Float,
): ClipWindowResolver.Window = when (edit) {
    is ClipWindowResolver.Edit.Move ->
        ClipWindowResolver.Window(window.start.coerceAtMost(maxOf(0f, duration - window.duration)), window.duration)
    is ClipWindowResolver.Edit.SetEnd ->
        ClipWindowResolver.Window(window.start, maxOf(ClipWindowResolver.MINIMUM_DURATION, minOf(window.end, duration) - window.start))
    else -> window
}

/** Le pas d'un réglage au lecteur d'écran, en secondes (iOS `ComposerSceneFriseMetrics.accessibilityStep`). */
private const val FRISE_ACCESSIBILITY_STEP = 0.5f

@Composable
private fun Handle(fraction: Float, laneWidthPx: Int, grip: Grip, drag: (Grip) -> Modifier) {
    Box(
        modifier = Modifier
            .offset { IntOffset((fraction * laneWidthPx).roundToInt() - HANDLE_HIT.roundToPx() / 2, 0) }
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
    onSnap: () -> Unit = {},
): Modifier = pointerInput(key, grip, geometry) {
    var origin = from()
    var total = 0f
    var latest = origin
    var snapped = false
    detectDragGestures(
        onDragStart = {
            origin = from()
            total = 0f
            latest = origin
            snapped = false
            onStart()
        },
        onDrag = { change, amount ->
            change.consume()
            total += amount.x
            val drag = FriseBarDrag.resolveSnapped(grip, origin, total, geometry, candidates())
            // L'aimant se sent UNE fois, au passage « libre → accroché » (#14217, iso iOS), jamais à chaque image.
            if (drag.snapped && !snapped) onSnap()
            snapped = drag.snapped
            latest = drag.window
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
