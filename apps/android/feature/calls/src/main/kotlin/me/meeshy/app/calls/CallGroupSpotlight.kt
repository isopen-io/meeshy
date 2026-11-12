package me.meeshy.app.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.group.GroupCallFilmstrip
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
 * La scène « à la une » — iOS `GroupCallStageView.spotlight` : la vignette choisie en grand, la pellicule des
 * autres dessous (portrait) ou à droite (paysage), rien d'autre en plein écran. Un écran partagé se montre entier,
 * se zoome au pincement (1 à 4) et revient à 1 d'un double toucher ; un toucher simple rallume ou éteint le chrome.
 * La capsule « Grille · Plein écran » n'est pas ici : elle vit avec la scène ([CallGroupFeaturedCapsule]). Entrer en
 * plein écran fait SORTIR le bandeau par son bord de l'écran, en sortir l'y fait rentrer (U2.10, [CallStripExit]).
 */
@Composable
internal fun CallGroupSpotlightStage(
    tiles: List<GroupCallStageTile>,
    featured: GroupCallStageTile,
    isScreenShare: Boolean,
    isFullScreen: Boolean,
    isLandscape: Boolean,
    zoom: Float,
    onPinch: (Float) -> Unit,
    onResetZoom: () -> Unit,
    onStageTap: (() -> Unit)?,
    scope: CallGroupStageScope,
    modifier: Modifier = Modifier,
) {
    val others = tiles.filter { it.id != featured.id }
    val stripEdge = GroupCallSpotlight.filmstrip(isFullScreen = false, isLandscape = isLandscape)
    val exit = rememberCallStripExit(isFullScreen, stripEdge, if (isLandscape) VERTICAL_STRIP_WIDTH else STRIP_ROW_HEIGHT)
    val isLeaving by remember(exit) { derivedStateOf { exit.progress.value < 1f } }
    val stripScope = scope.forStrip()
    val chipArrival = rememberCallArrivalFade()
    Box(modifier.then(exit.measuring())) {
        val filmstrip = GroupCallSpotlight.filmstrip(isFullScreen, isLandscape = isLandscape)
        val featuredTile: @Composable (Modifier) -> Unit = { tileModifier ->
            CallGroupFeaturedTile(
                tile = featured,
                isScreenShare = isScreenShare,
                zoom = zoom,
                chipArrival = chipArrival,
                onPinch = onPinch,
                onResetZoom = onResetZoom,
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
            .callScrollEdgeFade(state, horizontal = true)
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
            .callScrollEdgeFade(state, horizontal = false)
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

@Composable
private fun CallGroupFeaturedTile(
    tile: GroupCallStageTile,
    isScreenShare: Boolean,
    zoom: Float,
    chipArrival: State<Float>,
    onPinch: (Float) -> Unit,
    onResetZoom: () -> Unit,
    onStageTap: (() -> Unit)?,
    scope: CallGroupStageScope,
    modifier: Modifier,
) {
    val title = if (isScreenShare) stringResource(R.string.call_screen_share_of, tile.displayName) else null
    val speech = callGroupTileSpeech(tile, title)
    val motion = scope.motionOf(tile.id)
    val separator = rememberCallDecimalSeparator()
    Box(modifier) {
        scope.Tile(
            render = CallGroupTileRender(
                tile = tile,
                track = scope.trackOf(tile),
                eglContext = scope.eglContext,
                mirror = tile.isLocal && scope.mirrorsLocal,
                fit = isScreenShare,
                zoom = if (isScreenShare) zoom else 1f,
            ),
            modifier = Modifier
                .fillMaxSize()
                .callTileMotion(motion)
                .then(if (isScreenShare) Modifier.clipToBounds() else Modifier)
                .pointerInput(isScreenShare) {
                    if (!isScreenShare) return@pointerInput
                    detectTransformGestures { _, _, gestureZoom, _ -> onPinch(gestureZoom) }
                }
                .pointerInput(isScreenShare, onStageTap) {
                    // Le double toucher n'existe que pour un écran partagé : posé partout, il ferait attendre CHAQUE
                    // toucher simple (rallumer les commandes) le délai d'un éventuel second toucher.
                    detectTapGestures(
                        onDoubleTap = if (isScreenShare) ({ onResetZoom() }) else null,
                        onTap = { onStageTap?.invoke() },
                    )
                }
                .semantics(mergeDescendants = true) {
                    contentDescription = speech.name
                    if (speech.states.isNotEmpty()) stateDescription = speech.states
                },
        )
        if (title != null) {
            CallScreenShareChip(
                text = GroupCallSpotlight.featuredChipText(title, zoom, separator),
                modifier = Modifier.align(Alignment.TopStart).padding(MeeshySpacing.sm).graphicsLayer { alpha = chipArrival.value },
            )
        }
    }
}

internal val STAGE_SPACING = GroupCallStageGeometry.SPACING.dp
private val STRIP_TILE_WIDTH = GroupCallStageGeometry.STRIP_TILE_WIDTH.dp
private val STRIP_TILE_HEIGHT = GroupCallStageGeometry.STRIP_TILE_HEIGHT.dp
private val STRIP_ROW_HEIGHT = GroupCallStageGeometry.STRIP_ROW_HEIGHT.dp
private val STRIP_HALO_PAD = GroupCallStageGeometry.STRIP_HALO_PAD.dp
private val VERTICAL_STRIP_WIDTH = GroupCallStageGeometry.STRIP_COLUMN_WIDTH.dp
