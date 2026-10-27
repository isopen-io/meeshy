package me.meeshy.ui.component.location

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.MapPinLift
import me.meeshy.sdk.model.location.SlippyMap
import me.meeshy.ui.icons.MeeshyIcons
import kotlin.math.roundToInt

private const val MAP_USER_AGENT = "Meeshy-Android (+https://meeshy.me)"
private const val PINCH_ZOOM_IN = 1.6f
private const val PINCH_ZOOM_OUT = 0.625f

/**
 * Carte à tuiles rasters (OpenStreetMap, ou imagerie Esri en satellite/hybride) — le choix
 * d'Android : aucun SDK de carte, aucune clé d'API. Les maths vivent dans [SlippyMap] ; ce
 * composable ne fait que poser les tuiles, relayer le glissement / le pincement / le double
 * toucher, et crédite le fournisseur. Les tuiles sont posées en dp à un niveau de plus quand
 * l'écran est dense : la carte reste nette sans changer d'échelle.
 *
 * L'état (centre, zoom) est TENU PAR L'APPELANT ; [onInteractionChange] dit si un doigt est
 * posé (le pin du sélecteur se soulève pendant ce temps).
 */
@Composable
fun TileMapView(
    center: GeoPoint,
    zoom: Int,
    modifier: Modifier = Modifier,
    style: SharedMapStyle = SharedMapStyle.STANDARD,
    interactive: Boolean = false,
    onCenterChange: (GeoPoint) -> Unit = {},
    onZoomChange: (Int) -> Unit = {},
    onInteractionChange: (Boolean) -> Unit = {},
    markers: List<GeoPoint> = emptyList(),
    marker: @Composable (GeoPoint) -> Unit = {},
    placeholder: Color = MaterialTheme.colorScheme.surfaceVariant,
) {
    val density = LocalDensity.current
    val context = LocalContext.current
    val currentCenter by rememberUpdatedState(center)
    val currentZoom by rememberUpdatedState(zoom)
    val latestCenterChange by rememberUpdatedState(onCenterChange)
    val latestZoomChange by rememberUpdatedState(onZoomChange)
    val latestInteraction by rememberUpdatedState(onInteractionChange)
    val sharp = density.density >= 2f
    val tileDp = if (sharp) SlippyMap.TILE_SIZE / 2 else SlippyMap.TILE_SIZE
    val pyramidZoom = if (sharp) zoom + 1 else zoom

    BoxWithConstraints(
        modifier = modifier
            .clipToBounds()
            .background(placeholder)
            .then(if (interactive) Modifier.mapGestures(
                zoomOf = { currentZoom },
                centerOf = { currentCenter },
                tileSize = tileDp,
                pyramidZoomOf = { if (sharp) currentZoom + 1 else currentZoom },
                onCenter = { latestCenterChange(it) },
                onZoom = { latestZoomChange(SlippyMap.clampZoom(it)) },
                onInteraction = { latestInteraction(it) },
            ) else Modifier),
    ) {
        val widthDp = maxWidth.value.roundToInt()
        val heightDp = maxHeight.value.roundToInt()
        val tiles = remember(center, pyramidZoom, widthDp, heightDp, tileDp) {
            SlippyMap.tilesCovering(center, pyramidZoom, widthDp, heightDp, tileDp)
        }
        tiles.forEach { tile ->
            key(style, tile.zoom, tile.x, tile.y) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(tile.url(style))
                        .addHeader("User-Agent", MAP_USER_AGENT)
                        .crossfade(true)
                        .build(),
                    contentDescription = null,
                    contentScale = ContentScale.FillBounds,
                    modifier = Modifier
                        .offset(tile.offsetX.dp, tile.offsetY.dp)
                        .size(tileDp.dp),
                )
            }
        }
        val (cx, cy) = SlippyMap.worldPixel(center, pyramidZoom, tileDp)
        markers.forEach { point ->
            val (mx, my) = SlippyMap.worldPixel(point, pyramidZoom, tileDp)
            Box(
                Modifier.layout { measurable, constraints ->
                    val placeable = measurable.measure(constraints.copy(minWidth = 0, minHeight = 0))
                    val px = with(density) { ((mx - cx).toFloat() + widthDp / 2f).dp.toPx() }
                    val py = with(density) { ((my - cy).toFloat() + heightDp / 2f).dp.toPx() }
                    layout(0, 0) {
                        placeable.place((px - placeable.width / 2f).roundToInt(), (py - placeable.height / 2f).roundToInt())
                    }
                },
            ) { marker(point) }
        }
        Text(
            text = SlippyMap.attribution(style),
            style = MaterialTheme.typography.labelSmall,
            color = Color.Black.copy(alpha = 0.75f),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .background(Color.White.copy(alpha = 0.6f))
                .padding(horizontal = 4.dp),
        )
    }
}

private fun Modifier.mapGestures(
    zoomOf: () -> Int,
    centerOf: () -> GeoPoint,
    tileSize: Int,
    pyramidZoomOf: () -> Int,
    onCenter: (GeoPoint) -> Unit,
    onZoom: (Int) -> Unit,
    onInteraction: (Boolean) -> Unit,
): Modifier = this
    .pointerInput(Unit) {
        detectTapGestures(onDoubleTap = { onZoom(zoomOf() + 1) })
    }
    .pointerInput(Unit) {
        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false)
            onInteraction(true)
            var scale = 1f
            do {
                val event = awaitPointerEvent(PointerEventPass.Main)
                val pan = event.calculatePan()
                val zoomChange = event.calculateZoom()
                if (pan.x != 0f || pan.y != 0f) {
                    val dpx = pan.x / density
                    val dpy = pan.y / density
                    onCenter(SlippyMap.panned(centerOf(), dpx.toDouble(), dpy.toDouble(), pyramidZoomOf(), tileSize))
                    event.changes.forEach { it.consume() }
                }
                if (zoomChange != 1f) {
                    scale *= zoomChange
                    if (scale > PINCH_ZOOM_IN) { onZoom(zoomOf() + 1); scale = 1f }
                    else if (scale < PINCH_ZOOM_OUT) { onZoom(zoomOf() - 1); scale = 1f }
                }
            } while (event.changes.any { it.pressed })
            onInteraction(false)
        }
    }

/**
 * Le pin que la carte glisse dessous : il se soulève au premier signe de mouvement et se repose
 * quand la caméra s'arrête, son ombre rétrécit et pâlit (c'est elle qui fait lire le décollage).
 */
@Composable
fun MapCenterPin(lifted: Boolean, color: Color, modifier: Modifier = Modifier) {
    val target = MapPinLift.style(lifted)
    val spec = spring<Float>(dampingRatio = 0.68f, stiffness = Spring.StiffnessMediumLow)
    val scale by animateFloatAsState(target.scale, spec, label = "pin-scale")
    val lift by animateFloatAsState(target.yOffsetDp, spec, label = "pin-lift")
    val shadowScale by animateFloatAsState(target.shadowScale, spec, label = "pin-shadow-scale")
    val shadowAlpha by animateFloatAsState(target.shadowAlpha, spec, label = "pin-shadow-alpha")
    Box(modifier.size(PIN_SIZE), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .align(Alignment.Center)
                .size(width = 14.dp, height = 5.dp)
                .scale(shadowScale)
                .background(Color.Black.copy(alpha = shadowAlpha), CircleShape),
        )
        Icon(
            imageVector = MeeshyIcons.LocationFilled,
            contentDescription = null,
            tint = color,
            modifier = Modifier
                .size(PIN_SIZE)
                .offset(y = lift.dp - PIN_SIZE / 2)
                .scale(scale),
        )
    }
}

internal val PIN_SIZE = 40.dp
