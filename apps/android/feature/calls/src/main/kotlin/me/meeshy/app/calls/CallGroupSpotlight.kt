package me.meeshy.app.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.camera.CallCameraZoom
import me.meeshy.sdk.model.call.CallVerticalEdge
import me.meeshy.sdk.model.call.group.GroupCallFilmstrip
import me.meeshy.sdk.model.call.group.GroupCallFullScreenLevel
import me.meeshy.sdk.model.call.group.GroupCallSpotlight
import me.meeshy.sdk.model.call.group.GroupCallStageGeometry
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Ce que la scène à la une sait faire : nommer la vidéo d'une vignette, répondre aux gestes, poser chaque vignette dans
 * son contenu mobile (P14.10 : sa vidéo change de place sans être recréée) et lui rendre son mouvement.
 */
internal data class CallGroupStageScope(
    val trackOf: (GroupCallStageTile) -> org.webrtc.VideoTrack?,
    val eglContext: org.webrtc.EglBase.Context,
    val mirrorsLocal: Boolean,
    val onTileTap: (GroupCallStageTile) -> Unit,
    val contentOf: (String) -> CallGroupTileContent,
    val motionOf: (String) -> CallTileMotion? = { null },
) {
    @Composable
    fun Tile(render: CallGroupTileRender, modifier: Modifier) = contentOf(render.tile.id)(render, modifier)
}

/**
 * Une vignette qu'on peut toucher — iOS `selectableTile` : TalkBack lit son nom puis ses états, et l'action
 * « Touchez pour mettre à la une » la met à la une ; le toucher suit [GroupStageTapRule] (chrome masqué, il le
 * rallume ; sinon, la vignette passe à la une).
 */
@Composable
internal fun CallGroupSelectableTile(tile: GroupCallStageTile, scope: CallGroupStageScope, modifier: Modifier = Modifier) {
    val speech = callGroupTileSpeech(tile, title = null)
    val hint = stringResource(R.string.call_group_spotlight_hint)
    scope.Tile(
        render = CallGroupTileRender(
            tile = tile,
            track = scope.trackOf(tile),
            eglContext = scope.eglContext,
            mirror = tile.isLocal && scope.mirrorsLocal,
        ),
        modifier = modifier
            .callTileMotion(scope.motionOf(tile.id))
            .clickable(role = Role.Button, onClickLabel = hint) { scope.onTileTap(tile) }
            .semantics(mergeDescendants = true) {
                contentDescription = speech.name
                if (speech.states.isNotEmpty()) stateDescription = speech.states
            },
    )
}

/**
 * La scène « à la une » — iOS `GroupCallStageView.spotlight` : la vignette choisie en grand, la pellicule des autres
 * dessous (portrait) ou à droite (paysage). Le plein écran (U2) GARDE la pellicule ; seul le plein écran total (U2b,
 * un écran partagé) la fait SORTIR par son bord de l'écran, et en sortir l'y fait rentrer (U2.10, [CallStripExit] ;
 * #17961). Un écran partagé se montre entier, se zoome au pincement (1 à 4), se déplace au doigt une fois zoomé, et
 * revient à 1 d'un double toucher ; MA caméra à la une se zoome au pincement (#18181) ; un toucher simple rallume ou
 * éteint le chrome. La capsule « Grille · Plein écran » n'est pas ici : elle vit avec la scène ([CallGroupFeaturedCapsule]).
 */
@Composable
internal fun CallGroupSpotlightStage(
    tiles: List<GroupCallStageTile>,
    featured: GroupCallStageTile,
    isScreenShare: Boolean,
    level: GroupCallFullScreenLevel,
    isLandscape: Boolean,
    screenZoom: CallReceivedScreenZoom,
    onStageTap: (() -> Unit)?,
    scope: CallGroupStageScope,
    modifier: Modifier = Modifier,
    selfCameraZoom: CallCameraZoom? = null,
    isChipVisible: Boolean = true,
    onChromeRevive: () -> Unit = {},
) {
    val others = tiles.filter { it.id != featured.id }
    val stripEdge = GroupCallSpotlight.filmstrip(isStripHidden = false, isLandscape = isLandscape)
    val exit = rememberCallStripExit(level.hidesStrip, stripEdge, if (isLandscape) VERTICAL_STRIP_WIDTH else STRIP_ROW_HEIGHT)
    val isLeaving by remember(exit) { derivedStateOf { exit.progress.value < 1f } }
    val stripScope = scope.forStrip()
    val chipArrival = rememberCallArrivalFade()
    val selfZoom = selfCameraZoom?.takeIf { !isScreenShare && featured.isLocal && featured.showsVideo }
    Box(modifier.then(exit.measuring())) {
        val filmstrip = GroupCallSpotlight.filmstrip(level, isLandscape = isLandscape)
        val featuredTile: @Composable (Modifier) -> Unit = { tileModifier ->
            CallGroupFeaturedTile(
                tile = featured,
                isScreenShare = isScreenShare,
                screenZoom = screenZoom,
                selfZoom = selfZoom,
                chip = CallFeaturedChip(chipArrival, isChipVisible, onChromeRevive),
                onStageTap = onStageTap,
                scope = scope,
                modifier = tileModifier,
            )
        }
        when (filmstrip) {
            GroupCallFilmstrip.None -> featuredTile(Modifier.fillMaxSize())
            GroupCallFilmstrip.Trailing -> Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(STAGE_SPACING)) {
                featuredTile(Modifier.weight(1f).fillMaxHeight())
                CallGroupFilmstripColumn(others, stripScope, Modifier.width(VERTICAL_STRIP_WIDTH).fillMaxHeight().then(exit.sliding()))
            }
            GroupCallFilmstrip.Bottom -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(STAGE_SPACING)) {
                featuredTile(Modifier.weight(1f).fillMaxWidth())
                CallGroupFilmstripRow(others, stripScope, Modifier.fillMaxWidth().height(STRIP_ROW_HEIGHT).then(exit.sliding()))
            }
        }
        if (filmstrip == GroupCallFilmstrip.None && isLeaving) {
            val leaving = stripScope.copy(onTileTap = {})
            val gone = Modifier.clearAndSetSemantics { }.then(exit.sliding())
            if (stripEdge == GroupCallFilmstrip.Trailing) {
                CallGroupFilmstripColumn(others, leaving, Modifier.align(Alignment.TopEnd).width(VERTICAL_STRIP_WIDTH).fillMaxHeight().then(gone))
            } else {
                CallGroupFilmstripRow(others, leaving, Modifier.align(Alignment.BottomStart).fillMaxWidth().height(STRIP_ROW_HEIGHT).then(gone))
            }
        }
    }
}

/**
 * Les vignettes du bandeau n'ont pas de mouvement de grille quand elles n'ont pas de case d'un des deux côtés : le plein
 * écran les retire de la géométrie, et c'est le glissement du bandeau (U2.10) qui les fait entrer ou sortir.
 */
private fun CallGroupStageScope.forStrip(): CallGroupStageScope =
    copy(motionOf = { id -> motionOf(id)?.takeIf { it.from != null && it.to != null } })

/**
 * Le bandeau des autres en portrait (P14.9) : une rangée qui défile, effacée en fondu à ses deux bords. L'air du halo de
 * qui parle (dessus et dessous) est RÉSERVÉ dans sa hauteur, pour qu'il ne soit jamais rogné. Une rangée simple, comme
 * iOS (`ScrollView` + `HStack`) : cinq autres au plus (`CallRules.MAX_PARTICIPANTS`), et chaque vignette reste dans la
 * composition de la scène — son contenu mobile y arrive de la grille sans jamais traverser une liste paresseuse (P14.10).
 */
@Composable
private fun CallGroupFilmstripRow(others: List<GroupCallStageTile>, scope: CallGroupStageScope, modifier: Modifier) {
    val state = rememberScrollState()
    Row(
        modifier = modifier
            .callScrollEdgeFade(horizontal = true)
            .horizontalScroll(state)
            .padding(vertical = STRIP_HALO_PAD),
        horizontalArrangement = Arrangement.spacedBy(STAGE_SPACING),
    ) {
        others.forEach { tile ->
            key(tile.id) { CallGroupSelectableTile(tile, scope, Modifier.size(STRIP_TILE_WIDTH, STRIP_TILE_HEIGHT)) }
        }
    }
}

/** Le bandeau des autres en paysage (P14.9) : une colonne qui défile, effacée en fondu à ses deux bords. */
@Composable
private fun CallGroupFilmstripColumn(others: List<GroupCallStageTile>, scope: CallGroupStageScope, modifier: Modifier) {
    val state = rememberScrollState()
    Column(
        modifier = modifier
            .callScrollEdgeFade(horizontal = false)
            .verticalScroll(state)
            .padding(vertical = STRIP_HALO_PAD),
        verticalArrangement = Arrangement.spacedBy(STAGE_SPACING),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        others.forEach { tile ->
            key(tile.id) { CallGroupSelectableTile(tile, scope, Modifier.size(STRIP_TILE_WIDTH, STRIP_TILE_HEIGHT)) }
        }
    }
}

/** Ce que la puce de l'écran à la une lit : son arrivée en fondu, et si elle est rangée avec la capsule. */
private data class CallFeaturedChip(val arrival: State<Float>, val isVisible: Boolean, val onRevive: () -> Unit)

@Composable
private fun CallGroupFeaturedTile(
    tile: GroupCallStageTile,
    isScreenShare: Boolean,
    screenZoom: CallReceivedScreenZoom,
    selfZoom: CallCameraZoom?,
    chip: CallFeaturedChip,
    onStageTap: (() -> Unit)?,
    scope: CallGroupStageScope,
    modifier: Modifier,
) {
    val title = if (isScreenShare) stringResource(R.string.call_screen_share_of, tile.displayName) else null
    val speech = callGroupTileSpeech(tile, title)
    val motion = scope.motionOf(tile.id)
    val reduceMotion = rememberCallReduceMotion()
    val videoLayer = remember(screenZoom, isScreenShare) { Modifier.callReceivedScreenZoomLayer(screenZoom, isReceivingScreen = isScreenShare) }
    // Le double toucher n'existe qu'une fois l'image zoomée : posé partout, il ferait attendre CHAQUE toucher simple
    // (rallumer les commandes) le délai d'un éventuel second toucher.
    val gestures = when {
        isScreenShare -> Modifier.callReceivedScreenZoomGestures(screenZoom, reduceMotion, onStageTap)
        selfZoom != null -> Modifier.callSpotlightSelfZoom(selfZoom, onStageTap)
        else -> Modifier.pointerInput(onStageTap) { detectTapGestures(onTap = { onStageTap?.invoke() }) }
    }
    Box(modifier) {
        scope.Tile(
            render = CallGroupTileRender(
                tile = tile,
                track = scope.trackOf(tile),
                eglContext = scope.eglContext,
                mirror = tile.isLocal && scope.mirrorsLocal,
                fit = isScreenShare,
                videoLayer = videoLayer,
            ),
            modifier = Modifier
                .fillMaxSize()
                .callTileMotion(motion)
                .then(if (isScreenShare) Modifier.clipToBounds() else Modifier)
                .then(gestures)
                .semantics(mergeDescendants = true) {
                    contentDescription = speech.name
                    if (speech.states.isNotEmpty()) stateDescription = speech.states
                },
        )
        if (title != null) {
            // P11.1 · U2 : sous l'en-tête qui flotte sur la scène, à côté de ses boutons et jamais dessous.
            val belowHeader = LocalCallGroupGridClearance.current
            CallFeaturedScreenChip(title, screenZoom, chip, Modifier.align(Alignment.TopStart).callBelowTheFloatingHeader(belowHeader).padding(MeeshySpacing.sm))
        }
        if (selfZoom != null) {
            Box(Modifier.matchParentSize().callCameraZoomAdjustable(selfZoom))
            CallZoomIndicator(selfZoom, Modifier.align(Alignment.BottomCenter).padding(bottom = MeeshySpacing.xxl))
        }
    }
}

/**
 * U1.14 · #18181 — pincer MA vignette à la une zoome ma caméra, comme iOS (`callCameraZoom`) et le web. Le double toucher
 * n'existe qu'une fois zoomée (il rend 1×) ; à 1×, le toucher simple n'attend rien.
 */
@Composable
private fun Modifier.callSpotlightSelfZoom(zoom: CallCameraZoom, onStageTap: (() -> Unit)?): Modifier {
    val camera = zoom.state.collectAsState()
    val zoomed by remember(camera) {
        derivedStateOf { camera.value.profile?.let { profile -> camera.value.displayFactor != profile.baselineDisplay } == true }
    }
    return this
        .callCameraPinch(enabled = true, zoom = zoom)
        .pointerInput(zoom, zoomed, onStageTap) {
            detectTapGestures(
                onDoubleTap = if (zoomed) ({ zoom.resetToBaseline() }) else null,
                onTap = { onStageTap?.invoke() },
            )
        }
}

/** Où la puce se tenait dans la fenêtre au dernier placement : sa course de rangement va jusqu'au bord haut. */
private class CallChipTop {
    var px = 0f
}

/**
 * U2.5 · #17961 point 1 — la puce « Écran de X · 2× » se range avec la capsule au toucher, aux deux niveaux du plein
 * écran, et revient avec elle : elle sort par le haut, en fondu seul sous « Réduire les animations ». Le texte ne se
 * recompose qu'au dixième de zoom qui change, jamais à chaque image du pincement.
 */
@Composable
private fun CallFeaturedScreenChip(title: String, screenZoom: CallReceivedScreenZoom, chip: CallFeaturedChip, modifier: Modifier) {
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val text by remember(title, locale, screenZoom) {
        derivedStateOf {
            val zoom = screenZoom.scale(isReceivingScreen = true)
            GroupCallSpotlight.featuredChipText(title, zoom, locale)
        }
    }
    val top = remember { CallChipTop() }
    val isChipVisible = chip.isVisible
    CallChromeFade(
        isVisible = isChipVisible,
        onRevive = chip.onRevive,
        modifier = modifier.onGloballyPositioned { top.px = it.positionInWindow().y },
        stowsToward = CallVerticalEdge.Top,
        edgeMargin = with(LocalDensity.current) { top.px.toDp() },
    ) {
        CallScreenShareChip(text = text, modifier = Modifier.graphicsLayer { alpha = chip.arrival.value })
    }
}

internal val STAGE_SPACING = GroupCallStageGeometry.SPACING.dp
private val STRIP_TILE_WIDTH = GroupCallStageGeometry.STRIP_TILE_WIDTH.dp
private val STRIP_TILE_HEIGHT = GroupCallStageGeometry.STRIP_TILE_HEIGHT.dp
private val STRIP_ROW_HEIGHT = GroupCallStageGeometry.STRIP_ROW_HEIGHT.dp
private val STRIP_HALO_PAD = GroupCallStageGeometry.STRIP_HALO_PAD.dp
private val VERTICAL_STRIP_WIDTH = GroupCallStageGeometry.STRIP_COLUMN_WIDTH.dp
