package me.meeshy.app.contacts.circles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.util.Locale
import kotlinx.coroutines.delay
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.relation.NearbyCircleFilter
import me.meeshy.sdk.model.relation.NearbyPlacement
import me.meeshy.sdk.model.relation.NearbyRules
import me.meeshy.sdk.model.relation.NearbySort
import me.meeshy.sdk.model.relation.SharedLocationFreshness
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationWindow
import me.meeshy.ui.component.kit.MeeshyActionGrid
import me.meeshy.ui.component.kit.MeeshyAnchoredSheet
import me.meeshy.ui.component.kit.MeeshyAnchoredSheetOutside
import me.meeshy.ui.component.kit.MeeshyAnchoredSheetSurface
import me.meeshy.ui.component.kit.MeeshyLabeledAction
import me.meeshy.ui.component.kit.MeeshyLabeledActionSize
import me.meeshy.ui.component.kit.MeeshyMeter
import me.meeshy.ui.component.kit.MeeshyMeterKind
import me.meeshy.ui.component.kit.MeeshyNote
import me.meeshy.ui.component.kit.MeeshyNoteKind
import me.meeshy.ui.component.kit.MeeshyNoteLead
import me.meeshy.ui.component.kit.MeeshyPersonRow
import me.meeshy.ui.component.kit.MeeshyPersonRowSize
import me.meeshy.ui.component.kit.MeeshyStateBlock
import me.meeshy.ui.component.kit.MeeshyStateBlockKind
import me.meeshy.ui.component.kit.MeeshyStateBlockSize
import me.meeshy.ui.component.kit.MeeshyStateArt
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

private const val TICK_MS = 15_000L

/**
 * LA FEUILLE BASSE de la carte (#18890) : la personne regardée (lieu, fraîcheur, temps restant, itinéraire, partager la
 * mienne), un vide dessiné quand elle ne partage pas, ou — sans personne ciblée — « Autour de toi », du plus près. La feuille
 * est opaque et ancrée (K15) ; le toucher hors d'elle traverse jusqu'à la carte.
 */
@Composable
@Suppress("LongParameterList")
internal fun LocationMapSheet(
    focusUserId: String?,
    displayName: String?,
    pins: List<SharedLocationPin>,
    selected: SharedLocationPin?,
    updatedAtMillis: Long?,
    actions: LocationMapActions,
    onDirections: (String) -> Unit,
    onSelect: (String) -> Unit,
    onClose: () -> Unit,
) {
    val label = selected?.name ?: displayName ?: stringResource(R.string.circles_locations_title)
    MeeshyAnchoredSheet(
        onDismissRequest = onClose,
        accessibilityLabel = label,
        isDragDismissEnabled = false,
        closeLabel = null,
        surface = MeeshyAnchoredSheetSurface.Dark,
        outside = MeeshyAnchoredSheetOutside.PassesThrough,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
            when {
                selected != null -> PersonSheet(selected, updatedAtMillis, actions, onDirections)
                focusUserId != null -> NotSharing(displayName.orEmpty(), actions.onShareMine)
                pins.isEmpty() -> NearbyEmpty()
                else -> NearbyList(pins, onSelect)
            }
        }
    }
}

@Composable
private fun rememberNowMillis(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(TICK_MS)
            now = System.currentTimeMillis()
        }
    }
    return now
}

@Composable
private fun PersonSheet(
    pin: SharedLocationPin,
    updatedAtMillis: Long?,
    actions: LocationMapActions,
    onDirections: (String) -> Unit,
) {
    val now = rememberNowMillis()
    val plan = PersonLocationSheetPlan.of(pin, updatedAtMillis, own = null, nowMillis = now)
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MeeshyPersonRow(
            title = pin.name ?: stringResource(R.string.circles_locations_someone),
            subtitle = stringResource(precisionRes(pin.precision)),
            size = MeeshyPersonRowSize.Header,
            showsDivider = false,
            avatar = { InitialsBubble(pin.initials) },
        )
        plan.freshness?.let { Freshness(it) }
        Countdown(plan.window, plan.isUrgent)
        SheetActions(plan, actions, onDirections)
    }
}

@Composable
private fun Freshness(freshness: SharedLocationFreshness) {
    val isLive = freshness is SharedLocationFreshness.Live
    val text = when (freshness) {
        is SharedLocationFreshness.Live -> stringResource(R.string.location_map_fresh_live, freshness.secondsAgo)
        is SharedLocationFreshness.Stale -> stringResource(R.string.location_map_fresh_stale, freshness.minutesAgo)
    }
    MeeshyNote(
        text = text,
        kind = if (isLive) MeeshyNoteKind.Ok else MeeshyNoteKind.Neutral,
        lead = if (isLive) MeeshyNoteLead.Pulse else MeeshyNoteLead.Dot,
    )
}

@Composable
private fun Countdown(window: SharedLocationWindow, isUrgent: Boolean) {
    val shared = stringResource(
        if (window.totalMillis > ONE_HOUR_MS) R.string.location_map_shared_for_hours else R.string.location_map_shared_for_hour,
    )
    val remaining = remainingText(window)
    MeeshyMeter(
        value = window.remainingMillis.toDouble(),
        total = window.totalMillis.toDouble(),
        label = shared,
        spokenValue = remaining,
        kind = if (isUrgent) MeeshyMeterKind.Warn else MeeshyMeterKind.Accent,
        title = shared,
        valueText = remaining,
        leading = { Icon(MeeshyIcons.Timer, contentDescription = null, modifier = Modifier.size(16.dp)) },
    )
}

private const val ONE_HOUR_MS = 3_600_000L

@Composable
private fun remainingText(window: SharedLocationWindow): String {
    val minutes = window.remainingMinutes
    return if (minutes < 60) {
        stringResource(R.string.location_map_remaining_minutes, minutes)
    } else {
        stringResource(R.string.location_map_remaining_hours, minutes / 60, minutes % 60)
    }
}

@Composable
private fun SheetActions(plan: PersonLocationSheetPlan, actions: LocationMapActions, onDirections: (String) -> Unit) {
    val directions = stringResource(R.string.location_map_directions)
    val distance = plan.distanceMeters?.let { formatDistance(it) }
    val tiles = buildList<@Composable (MeeshyLabeledActionSize) -> Unit> {
        add { size ->
            MeeshyLabeledAction(directions, MeeshyIcons.Directions, onClick = { onDirections(plan.directionsUri) }, size = size, value = distance)
        }
        actions.onWrite?.let { write ->
            add { size -> MeeshyLabeledAction(stringResource(R.string.location_map_write), MeeshyIcons.Chat, onClick = write, size = size) }
        }
        actions.onCall?.let { call ->
            add { size -> MeeshyLabeledAction(stringResource(R.string.location_map_call), MeeshyIcons.Call, onClick = call, size = size) }
        }
        actions.onShareMine?.let { share ->
            add { size -> MeeshyLabeledAction(stringResource(R.string.location_map_share_mine), MeeshyIcons.Location, onClick = share, size = size) }
        }
    }
    MeeshyActionGrid(actions = tiles)
}

@Composable
private fun NotSharing(name: String, onShareMine: (() -> Unit)?) {
    MeeshyStateBlock(
        kind = MeeshyStateBlockKind.Empty,
        title = stringResource(R.string.location_map_not_sharing, name),
        message = stringResource(R.string.location_map_not_sharing_message),
        glyph = MeeshyIcons.LocationOff,
        art = MeeshyStateArt.Glyph,
        size = MeeshyStateBlockSize.Compact,
    )
    onShareMine?.let { share ->
        val tiles = buildList<@Composable (MeeshyLabeledActionSize) -> Unit> {
            add { size ->
                MeeshyLabeledAction(stringResource(R.string.location_map_share_mine), MeeshyIcons.Location, onClick = share, size = size)
            }
        }
        MeeshyActionGrid(actions = tiles)
    }
}

@Composable
private fun NearbyEmpty() {
    MeeshyStateBlock(
        kind = MeeshyStateBlockKind.Empty,
        title = stringResource(R.string.location_map_nearby_empty),
        message = stringResource(R.string.location_map_nearby_empty_message),
        glyph = MeeshyIcons.LocationOff,
        art = MeeshyStateArt.Glyph,
        size = MeeshyStateBlockSize.Compact,
    )
}

/** « Autour de toi » : les épingles servies, rangées par la règle partagée ; un toucher cadre la personne. */
@Composable
private fun NearbyList(pins: List<SharedLocationPin>, onSelect: (String) -> Unit) {
    val now = rememberNowMillis()
    val placements = remember(pins, now) {
        pins.map { NearbyPlacement(it.userId, it.circle, distanceMeters = null, remainingMillis = it.deadlineMillis - now) }
    }
    val ordered = remember(placements) {
        NearbyRules.arranged(placements, NearbyCircleFilter.ALL, NearbySort.ENDING_SOON)
    }
    val byId = remember(pins) { pins.associateBy { it.userId } }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            stringResource(R.string.location_map_nearby_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        ordered.mapNotNull { byId[it.id] }.forEach { pin ->
            val window = SharedLocationWindow.of(pin.deadlineMillis, now)
            MeeshyPersonRow(
                title = pin.name ?: stringResource(R.string.circles_locations_someone),
                subtitle = stringResource(precisionRes(pin.precision)),
                meta = remainingText(window),
                size = MeeshyPersonRowSize.Regular,
                showsDivider = false,
                onPress = { onSelect(pin.userId) },
                avatar = { InitialsBubble(pin.initials) },
            )
        }
    }
}

@Composable
private fun InitialsBubble(initials: String) {
    Box(Modifier.size(40.dp).clip(CircleShape).background(MeeshyPalette.Indigo500), contentAlignment = Alignment.Center) {
        Text(initials, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
    }
}

private fun precisionRes(precision: SharedLocationPrecision): Int = when (precision) {
    SharedLocationPrecision.EXACT -> R.string.circles_locations_precision_exact
    SharedLocationPrecision.NEIGHBORHOOD -> R.string.circles_locations_precision_neighborhood
    SharedLocationPrecision.CITY -> R.string.circles_locations_precision_city
}

/** Une distance qui se lit d'un coup d'œil : « 850 m », « 2,4 km » selon la langue. */
internal fun formatDistance(meters: Double, locale: Locale = Locale.getDefault()): String =
    if (meters < 1_000) String.format(locale, "%d m", meters.toInt()) else String.format(locale, "%.1f km", meters / 1_000)
