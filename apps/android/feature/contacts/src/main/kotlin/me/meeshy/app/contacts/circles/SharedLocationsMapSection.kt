package me.meeshy.app.contacts.circles

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.location.SlippyMap
import me.meeshy.sdk.model.relation.SharedLocationBounds
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationsMap
import me.meeshy.ui.component.location.TileMapView
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private val MAP_HEIGHT = 240.dp
private val PIN_SIZE = 32.dp
private const val MAX_BLUR_RADIUS_DP = 4_000f

/**
 * La section « Positions partagées avec toi » de « Mes cercles » (#16985, iso `SharedLocationsMapSection.swift` #16983 et
 * de l'onglet Cercles du web #16984) : une carte qui ne se montre que si quelqu'un me partage sa position, chaque épingle
 * posée là où le serveur l'a servie, entourée du cercle de flou que son émetteur a choisi.
 *
 * La carte est `TileMapView`, la carte à tuiles du dépôt (celle des messages de position) : aucune seconde carte.
 */
@Composable
fun SharedLocationsMapSection(viewModel: SharedLocationsMapViewModel = hiltViewModel()) {
    val pins by viewModel.pins.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.appeared() }
    if (pins.isEmpty()) return

    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Header(count = pins.size)
        SharedLocationsMapView(pins = pins, onViewportChange = viewModel::regionChanged)
        Text(
            text = stringResource(R.string.circles_locations_footnote),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

@Composable
private fun Header(count: Int) {
    val title = stringResource(R.string.circles_locations_title)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.clearAndSetSemantics {
            heading()
            contentDescription = "$title, $count"
        },
    ) {
        Icon(MeeshyIcons.LocationFilled, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary)
        Text("$count", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
private fun SharedLocationsMapView(
    pins: List<SharedLocationPin>,
    onViewportChange: (SharedLocationBounds?) -> Unit,
) {
    val mapLabel = stringResource(R.string.circles_locations_map)
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .height(MAP_HEIGHT)
            .clip(RoundedCornerShape(16.dp))
            .semantics { contentDescription = mapLabel },
    ) {
        val widthDp = maxWidth.value.toInt()
        val heightDp = maxHeight.value.toInt()
        var fitted by remember { mutableStateOf(false) }
        var center by remember { mutableStateOf(pins.first().point) }
        var zoom by remember { mutableIntStateOf(SharedLocationsMap.SINGLE_PIN_ZOOM) }
        LaunchedEffect(widthDp, heightDp) {
            if (fitted || widthDp <= 0) return@LaunchedEffect
            SharedLocationsMap.fit(pins.map { it.point }, widthDp, heightDp, SlippyMap.TILE_SIZE)?.let { (point, level) ->
                center = point
                zoom = level
                fitted = true
            }
        }
        LaunchedEffect(center, zoom, widthDp, heightDp) {
            if (fitted) onViewportChange(SharedLocationsMap.viewport(center, zoom, widthDp, heightDp, SlippyMap.TILE_SIZE))
        }
        val groups = remember(pins) { pins.groupBy { it.point } }
        TileMapView(
            center = center,
            zoom = zoom,
            interactive = true,
            onCenterChange = { center = it },
            onZoomChange = { zoom = it },
            markers = groups.keys.toList(),
            marker = { point -> PinGroup(groups[point].orEmpty(), zoom) },
            modifier = Modifier.fillMaxWidth().height(MAP_HEIGHT),
        )
    }
}

@Composable
private fun PinGroup(pins: List<SharedLocationPin>, zoom: Int) {
    Box {
        pins.forEachIndexed { index, pin -> Pin(pin, zoom, Modifier.offset(x = (index * 6).dp, y = (index * 6).dp)) }
    }
}

@Composable
private fun Pin(pin: SharedLocationPin, zoom: Int, modifier: Modifier = Modifier) {
    val tint = meeshyPresenceDotColor(rememberPresence(pin.userId)) ?: MeeshyPalette.Indigo500
    val radiusDp = SharedLocationsMap.radiusPixels(pin.radiusMeters, pin.point.latitude, zoom, SlippyMap.TILE_SIZE)
        .toFloat()
        .coerceAtMost(MAX_BLUR_RADIUS_DP)
    val label = pinLabel(pin)
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(PIN_SIZE)
            .drawBehind {
                val radius = radiusDp.dp.toPx()
                drawCircle(MeeshyPalette.Indigo500.copy(alpha = 0.14f), radius, Offset(size.width / 2, size.height / 2))
                drawCircle(
                    MeeshyPalette.Indigo500.copy(alpha = 0.45f),
                    radius,
                    Offset(size.width / 2, size.height / 2),
                    style = Stroke(width = 1.dp.toPx()),
                )
            }
            .clearAndSetSemantics { contentDescription = label },
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(PIN_SIZE).clip(CircleShape).background(tint),
        ) {
            Text(pin.initials, color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
    }
}

/** « nom, précision · jusqu'à HH:MM » — ce que TalkBack lit d'une épingle, iso `SharedLocationPin.accessibilityLabel`. */
@Composable
private fun pinLabel(pin: SharedLocationPin): String {
    val context = LocalContext.current
    val name = pin.name ?: stringResource(R.string.circles_locations_someone)
    val precision = stringResource(
        when (pin.precision) {
            SharedLocationPrecision.EXACT -> R.string.circles_locations_precision_exact
            SharedLocationPrecision.NEIGHBORHOOD -> R.string.circles_locations_precision_neighborhood
            SharedLocationPrecision.CITY -> R.string.circles_locations_precision_city
        },
    )
    val until = stringResource(
        R.string.circles_locations_pin_until,
        DateUtils.formatDateTime(context, pin.deadlineMillis, DateUtils.FORMAT_SHOW_TIME),
    )
    return "$name, $precision · $until"
}

