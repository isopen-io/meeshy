package me.meeshy.app.settings

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.TripOrigin
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les deux réglages de partage de position — « Précision du partage » et « Type de carte » —
 * rendus à l'identique dans Réglages > Confidentialité et dans la feuille « Partage de position »
 * du sélecteur de lieu (miroir de `LocationSharingSettingsSection.swift`). Sans état : l'hôte
 * fournit les préférences et reçoit les choix ; [accent] est l'accent du contexte hôte.
 */
@Composable
fun LocationSharingSettingsSection(
    preferences: LocationSharingPreferences,
    accent: Color,
    onSelectPrecision: (LocationPrecision) -> Unit,
    onSelectMapStyle: (SharedMapStyle) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        SelectableCardGroup(title = stringResource(R.string.location_precision_section), accent = accent) {
            LocationPrecision.entries.forEach { precision ->
                SelectableCard(
                    icon = precisionIcon(precision),
                    title = stringResource(precisionTitle(precision)),
                    selected = precision == preferences.precision,
                    accent = accent,
                    onClick = { onSelectPrecision(precision) },
                )
            }
        }
        Text(
            text = stringResource(R.string.location_precision_footnote),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
        )
        SelectableCardGroup(title = stringResource(R.string.location_map_style_section), accent = accent) {
            SharedMapStyle.entries.forEach { style ->
                SelectableCard(
                    icon = mapStyleIcon(style),
                    title = stringResource(mapStyleTitle(style)),
                    selected = style == preferences.mapStyle,
                    accent = accent,
                    onClick = { onSelectMapStyle(style) },
                )
            }
        }
    }
}

/**
 * Feuille « Partage de position » ouverte depuis le sélecteur de lieu. Autonome (son propre
 * ViewModel) : l'hôte n'a qu'à la présenter et à passer l'accent de sa conversation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationSharingSettingsSheet(
    accent: Color,
    onDismiss: () -> Unit,
    viewModel: LocationSharingSettingsViewModel = hiltViewModel(),
) {
    val preferences by viewModel.preferences.collectAsStateWithLifecycle()
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(bottom = MeeshySpacing.xl),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.location_settings_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                TextButton(onClick = onDismiss) {
                    Text(text = stringResource(R.string.common_done), color = accent)
                }
            }
            LocationSharingSettingsSection(
                preferences = preferences,
                accent = accent,
                onSelectPrecision = viewModel::setPrecision,
                onSelectMapStyle = viewModel::setMapStyle,
                modifier = Modifier.padding(top = MeeshySpacing.md),
            )
        }
    }
}

@Composable
private fun SelectableCardGroup(
    title: String,
    accent: Color,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = accent,
            modifier = Modifier
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .semantics { heading() },
        )
        Column(modifier = Modifier.selectableGroup()) { content() }
    }
}

@Composable
private fun SelectableCard(
    icon: ImageVector,
    title: String,
    selected: Boolean,
    accent: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .background(accent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(MeeshySpacing.md))
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Icon(imageVector = Icons.Filled.Check, contentDescription = null, tint = accent)
        }
    }
}

private fun precisionIcon(precision: LocationPrecision): ImageVector = when (precision) {
    LocationPrecision.EXACT -> Icons.Filled.GpsFixed
    LocationPrecision.AROUND -> Icons.Filled.TripOrigin
    LocationPrecision.NEIGHBORHOOD -> Icons.Filled.Home
    LocationPrecision.CITY -> Icons.Filled.LocationCity
}

@StringRes
private fun precisionTitle(precision: LocationPrecision): Int = when (precision) {
    LocationPrecision.EXACT -> R.string.location_precision_exact
    LocationPrecision.AROUND -> R.string.location_precision_around
    LocationPrecision.NEIGHBORHOOD -> R.string.location_precision_neighborhood
    LocationPrecision.CITY -> R.string.location_precision_city
}

private fun mapStyleIcon(style: SharedMapStyle): ImageVector = when (style) {
    SharedMapStyle.STANDARD -> Icons.Filled.Map
    SharedMapStyle.HYBRID -> Icons.Filled.Public
    SharedMapStyle.IMAGERY -> Icons.Filled.Photo
}

@StringRes
private fun mapStyleTitle(style: SharedMapStyle): Int = when (style) {
    SharedMapStyle.STANDARD -> R.string.location_map_style_standard
    SharedMapStyle.HYBRID -> R.string.location_map_style_hybrid
    SharedMapStyle.IMAGERY -> R.string.location_map_style_imagery
}
