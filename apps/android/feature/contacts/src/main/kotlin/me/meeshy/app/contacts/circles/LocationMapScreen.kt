package me.meeshy.app.contacts.circles

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.SlippyMap
import me.meeshy.sdk.model.relation.SharedLocationBounds
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationsMap
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.component.kit.MeeshyAvatarMorph
import me.meeshy.ui.component.kit.MeeshyBadge
import me.meeshy.ui.component.kit.MeeshyBadgeContent
import me.meeshy.ui.component.kit.MeeshyBadgeLeading
import me.meeshy.ui.component.kit.MeeshyBadgeSize
import me.meeshy.ui.component.kit.MeeshyBadgeSurface
import me.meeshy.ui.component.kit.MeeshyGlassButton
import me.meeshy.ui.component.kit.MeeshyGlassButtonKind
import me.meeshy.ui.component.kit.MeeshyMapPin
import me.meeshy.ui.component.kit.MeeshyMapPinPrecision
import me.meeshy.ui.component.location.TileMapView
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val MAX_BLUR_RADIUS_DP = 4_000f
private const val ARRIVAL_DELAY_MS = 180L
private const val HERO_DP = 96
private const val PIN_AVATAR_DP = 50

/** Ce que l'hôte de la fiche sait faire pour la personne regardée ; une action absente n'est pas offerte. */
internal data class LocationMapActions(
    val onShareMine: (() -> Unit)? = null,
    val onWrite: (() -> Unit)? = null,
    val onCall: (() -> Unit)? = null,
)

/**
 * LA CARTE COMME ACTION (#18890, planches Carte-Personne et Carte-Proches), en plein écran. Avec [focusUserId], l'avatar de
 * la personne quitte la fiche et devient l'épingle (K29 puis K36) pendant que la fiche devient la feuille basse (K15) ; sans
 * lui, c'est la carte de TOUS mes proches, sur la même carte et la même épingle. Aucune seconde carte : `TileMapView`.
 */
@Composable
fun LocationMapDialog(
    focusUserId: String?,
    displayName: String?,
    onClose: () -> Unit,
    onShareMine: (() -> Unit)? = null,
    onWrite: (() -> Unit)? = null,
    onCall: (() -> Unit)? = null,
) {
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary)) {
            LocationMapScreen(focusUserId, displayName, onClose, LocationMapActions(onShareMine, onWrite, onCall))
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun LocationMapScreen(
    focusUserId: String?,
    displayName: String?,
    onClose: () -> Unit,
    actions: LocationMapActions,
    viewModel: SharedLocationsMapViewModel = hiltViewModel(),
) {
    val pins by viewModel.pins.collectAsStateWithLifecycle()
    val updatedAt by viewModel.updatedAt.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.appeared() }
    val reduceMotion = LocalReduceMotion.current
    var selectedId by rememberSaveable { mutableStateOf(focusUserId) }
    var arrived by rememberSaveable { mutableStateOf(focusUserId == null || reduceMotion) }
    LaunchedEffect(focusUserId) {
        if (arrived) return@LaunchedEffect
        delay(ARRIVAL_DELAY_MS)
        arrived = true
    }
    var style by rememberSaveable { mutableStateOf(SharedMapStyle.STANDARD) }
    var recenter by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val selected = pins.firstOrNull { it.userId == selectedId }
    Box(Modifier.fillMaxSize()) {
        SharedTransitionLayout {
            MapStage(
                pins = pins,
                focusUserId = focusUserId,
                selectedId = selectedId,
                arrived = arrived,
                style = style,
                recenter = recenter,
                onSelect = { selectedId = it },
                onViewport = viewModel::regionChanged,
            )
        }
        MapChrome(
            selected = selected,
            isLayered = style == SharedMapStyle.HYBRID,
            onClose = onClose,
            onLayers = { style = if (style == SharedMapStyle.STANDARD) SharedMapStyle.HYBRID else SharedMapStyle.STANDARD },
            onRecenter = { recenter += 1 },
        )
        LocationMapSheet(
            focusUserId = focusUserId,
            displayName = displayName,
            pins = pins,
            selected = selected,
            updatedAtMillis = selected?.let { updatedAt[it.userId] },
            actions = actions,
            onDirections = { openDirections(context, it) },
            onSelect = { selectedId = it },
            onClose = onClose,
        )
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
@Suppress("LongParameterList", "LongMethod")
private fun SharedTransitionScope.MapStage(
    pins: List<SharedLocationPin>,
    focusUserId: String?,
    selectedId: String?,
    arrived: Boolean,
    style: SharedMapStyle,
    recenter: Int,
    onSelect: (String) -> Unit,
    onViewport: (SharedLocationBounds?) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val widthDp = maxWidth.value.toInt()
        val heightDp = maxHeight.value.toInt()
        var center by remember { mutableStateOf(GeoPoint(0.0, 0.0)) }
        var zoom by remember { mutableIntStateOf(SharedLocationsMap.SINGLE_PIN_ZOOM) }
        val framed = remember(pins, focusUserId) { pins.filter { focusUserId == null || it.userId == focusUserId }.map { it.point } }
        var fitted by remember { mutableStateOf(false) }
        var lastRecenter by remember { mutableIntStateOf(0) }
        LaunchedEffect(framed, widthDp, heightDp, recenter) {
            val fit = SharedLocationsMap.fit(framed, widthDp, heightDp, SlippyMap.TILE_SIZE) ?: return@LaunchedEffect
            val asked = recenter != lastRecenter
            if (fitted && !asked) return@LaunchedEffect
            lastRecenter = recenter
            center = fit.first
            zoom = fit.second
            fitted = true
        }
        LaunchedEffect(center, zoom, widthDp, heightDp, fitted) {
            if (fitted) onViewport(SharedLocationsMap.viewport(center, zoom, widthDp, heightDp, SlippyMap.TILE_SIZE))
        }
        val groups = remember(pins) { pins.groupBy { it.point } }
        TileMapView(
            center = center,
            zoom = zoom,
            style = style,
            interactive = true,
            onCenterChange = { center = it },
            onZoomChange = { zoom = it },
            markers = groups.keys.toList(),
            marker = { point ->
                Box {
                    groups[point].orEmpty().forEachIndexed { index, pin ->
                        PersonPin(
                            pin = pin,
                            zoom = zoom,
                            isSelected = pin.userId == selectedId,
                            travels = pin.userId == focusUserId,
                            arrived = arrived,
                            onPress = { onSelect(pin.userId) },
                            modifier = Modifier.padding(start = (index * 6).dp, top = (index * 6).dp),
                        )
                    }
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        val hero = pins.firstOrNull { it.userId == focusUserId }
        if (hero != null) {
            AnimatedVisibility(
                visible = !arrived,
                enter = EnterTransition.None,
                exit = ExitTransition.None,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 120.dp).decorative(),
            ) {
                MeeshyAvatarMorph(identity = hero.userId, sizeDp = HERO_DP, fromDp = HERO_DP, toDp = PIN_AVATAR_DP, visibility = this) {
                    InitialsDisc(hero.initials, HERO_DP)
                }
            }
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
@Suppress("LongParameterList")
private fun SharedTransitionScope.PersonPin(
    pin: SharedLocationPin,
    zoom: Int,
    isSelected: Boolean,
    travels: Boolean,
    arrived: Boolean,
    onPress: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = meeshyPresenceDotColor(rememberPresence(pin.userId)) ?: MeeshyPalette.Indigo500
    val radiusDp = SharedLocationsMap.radiusPixels(pin.radiusMeters, pin.point.latitude, zoom, SlippyMap.TILE_SIZE)
        .toFloat()
        .coerceAtMost(MAX_BLUR_RADIUS_DP)
    val precision = when (pin.precision) {
        SharedLocationPrecision.EXACT -> MeeshyMapPinPrecision.Exact
        SharedLocationPrecision.NEIGHBORHOOD -> MeeshyMapPinPrecision.Area(radiusDp)
        SharedLocationPrecision.CITY -> MeeshyMapPinPrecision.Wide(radiusDp)
    }
    MeeshyMapPin(
        label = pinLabel(pin),
        modifier = modifier,
        tint = tint,
        precision = precision,
        isSelected = isSelected,
        onPress = onPress,
    ) {
        if (travels) {
            AnimatedVisibility(visible = arrived, enter = EnterTransition.None, exit = ExitTransition.None) {
                MeeshyAvatarMorph(identity = pin.userId, sizeDp = PIN_AVATAR_DP, fromDp = HERO_DP, toDp = PIN_AVATAR_DP, visibility = this) {
                    InitialsDisc(pin.initials, PIN_AVATAR_DP)
                }
            }
        } else {
            InitialsDisc(pin.initials, PIN_AVATAR_DP)
        }
    }
}

@Composable
private fun InitialsDisc(initials: String, sizeDp: Int) {
    Box(
        modifier = Modifier.size(sizeDp.dp).clip(CircleShape).background(MeeshyPalette.Indigo500),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun MapChrome(
    selected: SharedLocationPin?,
    isLayered: Boolean,
    onClose: () -> Unit,
    onLayers: () -> Unit,
    onRecenter: () -> Unit,
) {
    Box(Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp)) {
        MeeshyGlassButton(
            label = stringResource(R.string.location_map_close),
            onClick = onClose,
            modifier = Modifier.align(Alignment.TopStart),
        ) { size -> Icon(MeeshyIcons.ChevronDown, null, Modifier.size(size)) }
        selected?.let { pin ->
            MeeshyBadge(
                content = MeeshyBadgeContent.Label(stringResource(viewRes(pin.precision))),
                leading = MeeshyBadgeLeading.Icon(MeeshyIcons.Location),
                surface = MeeshyBadgeSurface.Glass,
                size = MeeshyBadgeSize.S36,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
        Column(Modifier.align(Alignment.TopEnd), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MeeshyGlassButton(
                label = stringResource(R.string.location_map_layers),
                onClick = onLayers,
                kind = if (isLayered) MeeshyGlassButtonKind.Active else null,
            ) { size -> Icon(MeeshyIcons.Layers, null, Modifier.size(size)) }
            MeeshyGlassButton(
                label = stringResource(R.string.location_map_recenter),
                onClick = onRecenter,
            ) { size -> Icon(MeeshyIcons.MyLocation, null, Modifier.size(size)) }
        }
    }
}

private fun viewRes(precision: SharedLocationPrecision): Int = when (precision) {
    SharedLocationPrecision.EXACT -> R.string.location_map_view_exact
    SharedLocationPrecision.NEIGHBORHOOD -> R.string.location_map_view_neighborhood
    SharedLocationPrecision.CITY -> R.string.location_map_view_city
}

/** « Itinéraire » : l'application de cartes de l'appareil, vers la position SERVIE (jamais plus fine). */
private fun openDirections(context: Context, uri: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        // Aucune application de cartes : l'action ne fait rien plutôt que de planter.
    }
}
