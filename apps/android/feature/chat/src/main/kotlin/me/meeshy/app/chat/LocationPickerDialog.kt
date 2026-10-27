package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.LocationPickerState
import me.meeshy.sdk.model.location.PlaceLabels
import me.meeshy.sdk.model.location.SlippyMap
import me.meeshy.ui.component.location.MapCenterPin
import me.meeshy.ui.component.location.MapAttribution
import me.meeshy.ui.component.location.TileMapView
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.openAppSettings
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val WORLD_CENTER = GeoPoint(20.0, 0.0)
private const val WORLD_ZOOM = 3
private val CONTROL_SIZE = 44.dp

/**
 * Le sélecteur de lieu (iOS `LocationPickerView`) : une carte que l'on glisse sous un pin fixe,
 * une recherche, un recentrage, la précision appliquée affichée avant l'envoi, un bandeau si
 * la localisation est refusée (la sélection manuelle reste possible). La permission n'est
 * demandée qu'ici, au tap sur « Lieu » — jamais au démarrage ; le relevé est unique et rien ne
 * suit la position une fois la feuille fermée.
 */
@Composable
internal fun LocationPickerDialog(
    accent: Color,
    settingsSheet: @Composable (accent: Color, onDismiss: () -> Unit) -> Unit,
    onSelect: (SharedPlace) -> Unit,
    onDismiss: () -> Unit,
    viewModel: LocationPickerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val target by viewModel.target.collectAsStateWithLifecycle()
    val locating by viewModel.isLocating.collectAsStateWithLifecycle()
    val preferences by viewModel.preferences.collectAsStateWithLifecycle()
    val permissions = rememberPermissionFlow()
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    var center by remember { mutableStateOf(WORLD_CENTER) }
    var zoom by remember { mutableStateOf(WORLD_ZOOM) }
    var moving by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.open()
        viewModel.onAccessResolved(permissions.ensure(PermissionNature.LOCATION, announcesRefusal = false))
    }
    LaunchedEffect(target?.nonce) {
        val t = target ?: return@LaunchedEffect
        center = t.point
        zoom = t.zoom
        viewModel.onMapMoved(t.point)
    }
    LaunchedEffect(Unit) {
        viewModel.confirmed.collect { place ->
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            onSelect(place)
            onDismiss()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            TileMapView(
                center = center,
                zoom = zoom,
                style = preferences.mapStyle,
                interactive = true,
                onCenterChange = { center = it; viewModel.onMapMoved(it) },
                onZoomChange = { zoom = SlippyMap.clampZoom(it) },
                onInteractionChange = { moving = it },
                modifier = Modifier.fillMaxSize(),
                showAttribution = false,
            )
            MapCenterPin(lifted = moving, color = accent, modifier = Modifier.align(Alignment.Center))

            Column(Modifier.fillMaxSize().statusBarsPadding()) {
                PickerTopBar(accent = accent, onCancel = onDismiss)
                SearchBar(
                    query = query,
                    accent = accent,
                    onQueryChange = viewModel::onQueryChange,
                    onClear = viewModel::clearQuery,
                )
                if (state.results.isNotEmpty()) {
                    ResultsList(state.results, accent, onChoose = viewModel::choose)
                }
                if (state.isLocationRefused) {
                    DeniedBanner(onClick = { context.openAppSettings() })
                }
                if (state.results.isEmpty()) {
                    FloatingControls(
                        accent = accent,
                        locating = locating,
                        onSettings = { showSettings = true },
                        onRecenter = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            viewModel.recenter()
                        },
                    )
                }
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.BottomEnd) {
                    MapAttribution(preferences.mapStyle)
                }
                BottomCard(
                    state = state,
                    precision = preferences.precision,
                    accent = accent,
                    onConfirm = viewModel::confirm,
                )
            }
            if (showSettings) settingsSheet(accent) { showSettings = false }
            PermissionFlowHost(permissions, accent = accent)
        }
    }
}

@Composable
private fun PickerTopBar(accent: Color, onCancel: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onCancel) { Text(stringResource(R.string.common_cancel), color = accent) }
        Text(
            stringResource(R.string.location_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f).padding(end = 64.dp).semantics { heading() },
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

@Composable
private fun SearchBar(query: String, accent: Color, onQueryChange: (String) -> Unit, onClear: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(MeeshyRadius.smPlus),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
    ) {
        TextField(
            value = query,
            onValueChange = onQueryChange,
            singleLine = true,
            placeholder = { Text(stringResource(R.string.location_search_placeholder)) },
            leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null, tint = accent) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    Icon(
                        MeeshyIcons.CloseCircleFilled,
                        contentDescription = stringResource(R.string.chat_search_clear),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .size(CONTROL_SIZE)
                            .clip(CircleShape)
                            .clickable(onClick = onClear)
                            .padding(12.dp),
                    )
                }
            },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ResultsList(results: List<me.meeshy.sdk.model.location.LocationSearchResult>, accent: Color, onChoose: (me.meeshy.sdk.model.location.LocationSearchResult) -> Unit) {
    Surface(
        shape = RoundedCornerShape(MeeshyRadius.smPlus),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.97f),
        shadowElevation = 6.dp,
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
    ) {
        LazyColumn(Modifier.heightIn(max = 360.dp)) {
            items(results) { result ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onChoose(result) }
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                        .semantics { role = Role.Button },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
                ) {
                    Box(
                        Modifier.size(28.dp).background(accent.copy(alpha = 0.14f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Icon(MeeshyIcons.Location, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp)) }
                    Column(Modifier.weight(1f)) {
                        Text(
                            result.name ?: result.address ?: stringResource(R.string.location_unknown),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (result.name != null && result.address != null) {
                            Text(
                                result.address!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                HorizontalDivider(Modifier.padding(start = 50.dp))
            }
        }
    }
}

@Composable
private fun DeniedBanner(onClick: () -> Unit) {
    val warning = Color(0xFFB45309)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(Color(0xFFFBBF24).copy(alpha = 0.22f))
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(MeeshyIcons.LocationOff, contentDescription = null, tint = warning, modifier = Modifier.size(16.dp))
        Text(stringResource(R.string.permission_location_denied), style = MaterialTheme.typography.bodySmall, color = warning)
    }
}

@Composable
private fun FloatingControls(accent: Color, locating: Boolean, onSettings: () -> Unit, onRecenter: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(end = MeeshySpacing.lg, top = MeeshySpacing.md),
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        ControlButton(MeeshyIcons.Info, stringResource(R.string.location_settings_open), accent, onClick = onSettings)
        ControlButton(MeeshyIcons.MyLocation, stringResource(R.string.location_recenter), accent, busy = locating, onClick = onRecenter)
    }
}

@Composable
private fun ControlButton(icon: ImageVector, label: String, tint: Color, busy: Boolean = false, onClick: () -> Unit) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        shadowElevation = 4.dp,
        modifier = Modifier
            .size(CONTROL_SIZE)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { role = Role.Button; contentDescription = label },
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = tint)
            else Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun BottomCard(state: LocationPickerState, precision: LocationPrecision, accent: Color, onConfirm: () -> Unit) {
    val place = state.place(precision)
    Surface(
        shape = RoundedCornerShape(MeeshyRadius.xl),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        Column(Modifier.padding(MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
                Icon(MeeshyIcons.LocationFilled, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                    val title = place?.let { PlaceLabels.title(it.name, it.address) }
                    when {
                        title != null -> Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        state.isGeocoding -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
                            CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 1.5.dp)
                            Text(stringResource(R.string.location_geocoding), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        else -> Text(stringResource(R.string.location_move_prompt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (place != null) {
                        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                PlaceLabels.coordinates(place, precision.decimalPlaces),
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                            Text("·", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                stringResource(precision.badgeRes()),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = accent,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
            Button(
                onClick = onConfirm,
                enabled = place != null,
                colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = Color.White),
                shape = RoundedCornerShape(MeeshyRadius.smPlus),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(MeeshyIcons.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.common_confirm), modifier = Modifier.padding(start = MeeshySpacing.xs), fontWeight = FontWeight.Bold)
            }
        }
    }
}

private fun LocationPrecision.badgeRes(): Int = when (this) {
    LocationPrecision.EXACT -> R.string.location_precision_badge_exact
    LocationPrecision.AROUND -> R.string.location_precision_badge_around
    LocationPrecision.NEIGHBORHOOD -> R.string.location_precision_badge_neighborhood
    LocationPrecision.CITY -> R.string.location_precision_badge_city
}
