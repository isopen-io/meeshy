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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.group.GroupCallFilmstrip
import me.meeshy.sdk.model.call.group.GroupCallSpotlight
import me.meeshy.sdk.model.call.group.GroupCallStageGeometry
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
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
    onGrid: () -> Unit,
    onToggleFullScreen: () -> Unit,
    onStageTap: (() -> Unit)?,
    scope: CallGroupStageScope,
    modifier: Modifier = Modifier,
) {
    val others = tiles.filter { it.id != featured.id }
    Box(modifier) {
        val filmstrip = GroupCallSpotlight.filmstrip(isFullScreen, isLandscape = isLandscape)
        val featuredTile: @Composable (Modifier) -> Unit = { tileModifier ->
            CallGroupFeaturedTile(
                tile = featured,
                isScreenShare = isScreenShare,
                isFullScreen = isFullScreen,
                zoom = zoom,
                onPinch = onPinch,
                onResetZoom = onResetZoom,
                onGrid = onGrid,
                onToggleFullScreen = onToggleFullScreen,
                onStageTap = onStageTap,
                scope = scope,
                modifier = tileModifier,
            )
        }
        when (filmstrip) {
            GroupCallFilmstrip.None -> featuredTile(Modifier.fillMaxSize())
            GroupCallFilmstrip.Trailing -> Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(STAGE_SPACING)) {
                featuredTile(Modifier.weight(1f).fillMaxHeight())
                CallGroupFilmstripColumn(others, scope, Modifier.width(VERTICAL_STRIP_WIDTH).fillMaxHeight())
            }
            GroupCallFilmstrip.Bottom -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(STAGE_SPACING)) {
                featuredTile(Modifier.weight(1f).fillMaxWidth())
                CallGroupFilmstripRow(others, scope, Modifier.fillMaxWidth().height(STRIP_ROW_HEIGHT))
            }
        }
    }
}

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
    isFullScreen: Boolean,
    zoom: Float,
    onPinch: (Float) -> Unit,
    onResetZoom: () -> Unit,
    onGrid: () -> Unit,
    onToggleFullScreen: () -> Unit,
    onStageTap: (() -> Unit)?,
    scope: CallGroupStageScope,
    modifier: Modifier,
) {
    val title = if (isScreenShare) stringResource(R.string.call_screen_share_of, tile.displayName) else null
    val speech = callGroupTileSpeech(tile, title)
    val motion = scope.motionOf(tile.id)
    Box(modifier) {
        scope.Tile(
            render = CallGroupTileRender(
                tile = tile,
                track = scope.trackOf(tile),
                eglContext = scope.eglContext,
                mirror = tile.isLocal && scope.mirrorsLocal,
                fit = isScreenShare,
                title = title,
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
        CallGroupSpotlightControls(
            isFullScreen = isFullScreen,
            onGrid = onGrid,
            onToggleFullScreen = onToggleFullScreen,
            modifier = Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.sm).callTileMotionFade(motion),
        )
    }
}

/** « Revenir à la grille » et « Plein écran », dans UN verre — iOS `spotlightControls`. */
@Composable
private fun CallGroupSpotlightControls(
    isFullScreen: Boolean,
    onGrid: () -> Unit,
    onToggleFullScreen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    MeeshyGlassSurface(modifier = modifier, shape = CircleShape) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            CallGroupSpotlightButton(MeeshyIcons.GridView, stringResource(R.string.call_group_grid), onGrid)
            CallGroupSpotlightButton(
                icon = if (isFullScreen) MeeshyIcons.CloseFullscreen else MeeshyIcons.OpenInFull,
                label = stringResource(if (isFullScreen) R.string.call_group_fullscreen_exit else R.string.call_group_fullscreen_enter),
                onClick = onToggleFullScreen,
            )
        }
    }
}

@Composable
private fun CallGroupSpotlightButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(SPOTLIGHT_BUTTON)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White)
    }
}

internal val STAGE_SPACING = GroupCallStageGeometry.SPACING.dp
private val SPOTLIGHT_BUTTON = 44.dp
private val STRIP_TILE_WIDTH = GroupCallStageGeometry.STRIP_TILE_WIDTH.dp
private val STRIP_TILE_HEIGHT = GroupCallStageGeometry.STRIP_TILE_HEIGHT.dp
private val STRIP_ROW_HEIGHT = GroupCallStageGeometry.STRIP_ROW_HEIGHT.dp
private val STRIP_HALO_PAD = GroupCallStageGeometry.STRIP_HALO_PAD.dp
private val VERTICAL_STRIP_WIDTH = GroupCallStageGeometry.STRIP_COLUMN_WIDTH.dp
