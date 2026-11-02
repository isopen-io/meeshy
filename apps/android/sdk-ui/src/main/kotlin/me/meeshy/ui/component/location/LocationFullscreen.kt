package me.meeshy.ui.component.location

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.PlaceLabels
import me.meeshy.sdk.model.location.SlippyMap
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private const val FULLSCREEN_ZOOM = 16

/**
 * Carte plein écran d'un lieu partagé — Android de `LocationFullscreenView` : la carte
 * déplaçable avec le pin du lieu, un en-tête (fermer, style de carte), une carte du bas (qui a
 * partagé, nom, adresse, coordonnées) et deux actions : ouvrir dans l'application de cartes,
 * itinéraire. Le pin tombe sur le lieu à l'ouverture, la carte du bas monte avec elle.
 */
@Composable
fun LocationFullscreen(
    place: SharedPlace,
    accentColor: String,
    senderName: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    initialStyle: SharedMapStyle = SharedMapStyle.STANDARD,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        LocationMapPanel(place, accentColor, senderName, onDismiss, modifier, initialStyle)
    }
}

/**
 * Le corps de la carte plein écran, sans fenêtre : la fiche « Carte » d'un message l'héberge dans sa
 * feuille ([onDismiss] `null` = pas de bouton fermer).
 */
@Composable
fun LocationMapPanel(
    place: SharedPlace,
    accentColor: String,
    senderName: String?,
    onDismiss: (() -> Unit)?,
    modifier: Modifier = Modifier,
    initialStyle: SharedMapStyle = SharedMapStyle.STANDARD,
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val accent = hexColor(accentColor, MaterialTheme.colorScheme.primary)
    val point = remember(place.latitude, place.longitude) { GeoPoint(place.latitude, place.longitude) }
    var center by remember(point) { mutableStateOf(point) }
    var zoom by rememberSaveable { mutableStateOf(FULLSCREEN_ZOOM) }
    var style by rememberSaveable { mutableStateOf(initialStyle) }
    var pinDropped by remember { mutableStateOf(false) }
    var cardShown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { pinDropped = true; cardShown = true }

    Box(modifier.fillMaxSize()) {
        TileMapView(
            center = center,
            zoom = zoom,
            style = style,
            interactive = true,
            onCenterChange = { center = it },
            onZoomChange = { zoom = SlippyMap.clampZoom(it) },
            markers = listOf(point),
            marker = { MapCenterPin(lifted = !pinDropped, color = accent) },
            modifier = Modifier.fillMaxSize(),
        )
        Row(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            if (onDismiss != null) {
                ChromeButton(MeeshyIcons.Close, stringResource(R.string.common_close), accent) { onDismiss() }
            } else {
                Box(Modifier.size(MAP_CHROME_SIZE))
            }
            ChromeButton(MeeshyIcons.Map, stringResource(R.string.location_fullscreen_mapStyle), accent) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                style = if (style == SharedMapStyle.STANDARD) SharedMapStyle.HYBRID else SharedMapStyle.STANDARD
            }
        }
        AnimatedVisibility(
            visible = cardShown,
            modifier = Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
        ) {
            PlaceCard(
                place = place,
                accent = accent,
                senderName = senderName,
                onOpen = { PlaceIntents.openInMaps(context, place) },
                onDirections = { PlaceIntents.directions(context, place) },
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.lg),
            )
        }
    }
}

private val MAP_CHROME_SIZE = 44.dp

@Composable
private fun ChromeButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        shadowElevation = 4.dp,
        modifier = Modifier
            .size(MAP_CHROME_SIZE)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { role = Role.Button; contentDescription = label },
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun PlaceCard(
    place: SharedPlace,
    accent: Color,
    senderName: String?,
    onOpen: () -> Unit,
    onDirections: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (title, subtitle) = PlaceLabels.infoLines(place.name, place.address)
    Surface(
        shape = RoundedCornerShape(MeeshyRadius.xl),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
        shadowElevation = 8.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            if (senderName != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
                    Icon(MeeshyIcons.Location, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
                    Text(senderName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                Icon(MeeshyIcons.LocationFilled, contentDescription = null, tint = accent, modifier = Modifier.size(24.dp))
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                    Text(
                        title ?: stringResource(R.string.location_fullscreen_sharedPosition),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (subtitle != null) {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(
                        PlaceLabels.coordinates(place, null),
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    )
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                Button(
                    onClick = onOpen,
                    colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = Color.White),
                    shape = RoundedCornerShape(MeeshyRadius.smPlus),
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(MeeshyIcons.Map, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(stringResource(R.string.bubble_location_open), modifier = Modifier.padding(start = MeeshySpacing.xsPlus), maxLines = 1)
                }
                OutlinedButton(
                    onClick = onDirections,
                    border = BorderStroke(1.5.dp, accent),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = accent),
                    shape = RoundedCornerShape(MeeshyRadius.smPlus),
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(MeeshyIcons.Directions, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(stringResource(R.string.location_fullscreen_directions), modifier = Modifier.padding(start = MeeshySpacing.xsPlus), maxLines = 1)
                }
            }
        }
    }
}
