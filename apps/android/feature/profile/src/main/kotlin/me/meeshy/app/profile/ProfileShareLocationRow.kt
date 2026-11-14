package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.Date
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationSendOutcome
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.relation.SharedLocationShareProblem
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val PROFILE_SHARE_LOCATION_TAG = "sharedLocation.share"
internal const val PROFILE_SHARE_LOCATION_STOP_TAG = "sharedLocation.stop"
internal const val PROFILE_SHARE_LOCATION_CONFIRM_TAG = "sharedLocation.confirm"

/** Le temps pendant lequel un refus reste dit sous la ligne avant de s'effacer. */
private const val PROBLEM_VISIBLE_MS = 4_000L

/** La ville d'abord : on ouvre plus, jamais l'inverse. */
private val PRECISION_ORDER = listOf(SharedLocationPrecision.CITY, SharedLocationPrecision.NEIGHBORHOOD, SharedLocationPrecision.EXACT)

/**
 * « Partager ma position » sur la fiche d'un Ami (#16985), iso `ProfileShareLocationRow.swift` (#16983) : la durée (1 h,
 * 8 h) et ce que la personne voit (la ville par défaut, le quartier, l'endroit exact) se choisissent dans une feuille,
 * puis la ligne dit « X voit ta position (…) jusqu'à HH:MM » et « Arrêter » d'un geste, tant que ça dure. La permission
 * demandée est celle « pendant l'utilisation » (`PermissionNature.LOCATION`), au moment du partage, jamais avant.
 */
@Composable
internal fun ProfileShareLocationRow(
    userId: String,
    displayName: String,
    viewModel: ProfileShareLocationViewModel = hiltViewModel(key = "share-location-$userId"),
) {
    LaunchedEffect(userId) { viewModel.load(userId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val permissions = rememberPermissionFlow()
    val scope = rememberCoroutineScope()
    var choosing by rememberSaveable(userId) { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        val entry = state.entry
        if (entry != null) {
            SharingLine(entry, displayName, isBusy = state.isBusy, onStop = viewModel::stop)
        } else {
            ShareButton(displayName, isBusy = state.isBusy, onClick = { choosing = true })
        }
        state.problem?.let { problem -> ProblemLine(problem, onShown = viewModel::consumeProblem) }
    }
    if (choosing) {
        ShareLocationChoiceSheet(
            displayName = displayName,
            onDismiss = { choosing = false },
            onShare = { precision, duration ->
                choosing = false
                scope.launch {
                    permissions.ensure(PermissionNature.LOCATION)
                    viewModel.share(precision, duration)
                }
            },
        )
    }
}

@Composable
private fun ShareButton(name: String, isBusy: Boolean, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val a11y = stringResource(R.string.shared_location_share_action_a11y, name)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(enabled = !isBusy, role = Role.Button) {
                haptics.medium()
                onClick()
            }
            .semantics { contentDescription = a11y }
            .testTag(PROFILE_SHARE_LOCATION_TAG),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MeeshyPalette.Indigo500)
        Text(
            text = stringResource(R.string.shared_location_share_action),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyPalette.Indigo500.copy(alpha = if (isBusy) 0.6f else 1f),
        )
    }
}

@Composable
private fun SharingLine(entry: SharedLocationRoster.Entry, name: String, isBusy: Boolean, onStop: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val until = android.text.format.DateFormat.getTimeFormat(context).format(Date(entry.untilMillis))
    val precision = stringResource(entry.precision.labelRes()).lowercase()
    val stopA11y = stringResource(R.string.shared_location_share_stop_a11y, name)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Text(
            text = "📍 " + stringResource(R.string.shared_location_share_active, name, precision, until),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier
                .weight(1f)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
        Text(
            text = stringResource(R.string.shared_location_share_stop),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyPalette.Error.copy(alpha = if (isBusy) 0.6f else 1f),
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clickable(enabled = !isBusy, role = Role.Button) {
                    haptics.medium()
                    onStop()
                }
                .semantics { contentDescription = stopA11y }
                .testTag(PROFILE_SHARE_LOCATION_STOP_TAG)
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
        )
    }
}

@Composable
private fun ProblemLine(problem: SharedLocationShareProblem, onShown: () -> Unit) {
    LaunchedEffect(problem) {
        delay(PROBLEM_VISIBLE_MS)
        onShown()
    }
    Text(
        text = stringResource(problem.messageRes()),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyPalette.Error,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
    )
}

/** La feuille du choix : durée et précision, la ville par défaut (on ouvre plus, jamais l'inverse). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareLocationChoiceSheet(
    displayName: String,
    onDismiss: () -> Unit,
    onShare: (SharedLocationPrecision, SharedLocationShareDuration) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var precision by rememberSaveable { mutableStateOf(SharedLocationPrecision.CITY) }
    var duration by rememberSaveable { mutableStateOf(SharedLocationShareDuration.ONE_HOUR) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = MeeshySpacing.xl)
                .padding(bottom = MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.shared_location_share_sheet_title, displayName),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            SectionTitle(stringResource(R.string.shared_location_share_duration_title))
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), modifier = Modifier.selectableGroup()) {
                SharedLocationShareDuration.entries.forEach { option ->
                    FilterChip(
                        selected = option == duration,
                        onClick = { duration = option },
                        label = { Text(stringResource(option.labelRes())) },
                        modifier = Modifier.heightIn(min = 48.dp),
                    )
                }
            }
            SectionTitle(stringResource(R.string.shared_location_share_precision_title))
            Column(Modifier.selectableGroup()) {
                PRECISION_ORDER.forEach { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .selectable(selected = option == precision, role = Role.RadioButton, onClick = { precision = option }),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = option == precision, onClick = null)
                        Text(
                            text = stringResource(option.labelRes()),
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.padding(start = MeeshySpacing.sm),
                        )
                    }
                }
            }
            Text(
                text = stringResource(R.string.shared_location_share_explain, displayName),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDismiss) { Text(stringResource(UiR.string.common_cancel)) }
                TextButton(
                    onClick = { onShare(precision, duration) },
                    modifier = Modifier.testTag(PROFILE_SHARE_LOCATION_CONFIRM_TAG),
                ) {
                    Text(stringResource(R.string.shared_location_share_confirm), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text = text, style = MaterialTheme.typography.labelLarge, color = MeeshyTheme.tokens.textSecondary)
}

private fun SharedLocationPrecision.labelRes(): Int = when (this) {
    SharedLocationPrecision.EXACT -> R.string.shared_location_precision_exact
    SharedLocationPrecision.NEIGHBORHOOD -> R.string.shared_location_precision_neighborhood
    SharedLocationPrecision.CITY -> R.string.shared_location_precision_city
}

private fun SharedLocationShareDuration.labelRes(): Int = when (this) {
    SharedLocationShareDuration.ONE_HOUR -> R.string.shared_location_share_one_hour
    SharedLocationShareDuration.EIGHT_HOURS -> R.string.shared_location_share_eight_hours
}

private fun SharedLocationShareProblem.messageRes(): Int = when (this) {
    SharedLocationShareProblem.LocationDenied -> R.string.shared_location_share_denied
    SharedLocationShareProblem.LocationUnavailable -> R.string.shared_location_share_unavailable
    is SharedLocationShareProblem.Refused -> when (outcome) {
        SharedLocationSendOutcome.OFFLINE -> R.string.shared_location_share_offline
        SharedLocationSendOutcome.RATE_LIMITED -> R.string.shared_location_share_rate_limited
        else -> R.string.shared_location_share_failed
    }
}
