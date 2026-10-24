package me.meeshy.app.calls

import me.meeshy.feature.calls.R
import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Hearing
import androidx.compose.material.icons.filled.Headset
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.Usb
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.call.CallAudioRoute
import me.meeshy.sdk.model.call.CallAudioRouteKind
import me.meeshy.sdk.model.call.CallAudioRouteState
import me.meeshy.ui.theme.MeeshySpacing

internal fun CallAudioRouteKind.icon(): ImageVector = when (this) {
    CallAudioRouteKind.Earpiece -> Icons.Filled.PhoneInTalk
    CallAudioRouteKind.Speaker -> Icons.Filled.VolumeUp
    CallAudioRouteKind.Bluetooth -> Icons.Filled.Bluetooth
    CallAudioRouteKind.Wired, CallAudioRouteKind.Other -> Icons.Filled.Headset
    CallAudioRouteKind.Usb -> Icons.Filled.Usb
    CallAudioRouteKind.HearingAid -> Icons.Filled.Hearing
    CallAudioRouteKind.Car -> Icons.Filled.DirectionsCar
}

@Composable
private fun CallAudioRoute.displayName(): String = name.ifBlank {
    stringResource(
        when (kind) {
            CallAudioRouteKind.Earpiece -> R.string.call_audio_earpiece
            CallAudioRouteKind.Speaker -> R.string.call_audio_speaker
            CallAudioRouteKind.Bluetooth -> R.string.call_audio_bluetooth
            CallAudioRouteKind.Wired -> R.string.call_audio_wired
            CallAudioRouteKind.Usb -> R.string.call_audio_usb
            CallAudioRouteKind.HearingAid -> R.string.call_audio_hearing_aid
            CallAudioRouteKind.Car -> R.string.call_audio_car
            CallAudioRouteKind.Other -> R.string.call_audio_other
        },
    )
}

/**
 * La feuille « Sortie » : une rangée par route (icône du genre, nom, coche sur la route active),
 * cibles de 48 dp, libellés TalkBack. Sans la permission Bluetooth, les routes Bluetooth sont
 * masquées et une ligne dit pourquoi, avec le moyen de l'accorder.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallAudioRouteSheet(
    state: CallAudioRouteState,
    accent: Color,
    onSelect: (Int) -> Unit,
    onBluetoothPermission: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = MeeshySpacing.lg)) {
            Text(
                text = stringResource(R.string.call_audio_sheet_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.md),
            )
            state.visibleRoutes.forEach { route ->
                CallAudioRouteRow(route, selected = route.id == state.activeId, accent = accent) {
                    onSelect(route.id)
                    onDismiss()
                }
            }
            if (state.bluetoothHidden) BluetoothPermissionRow(onBluetoothPermission)
        }
    }
}

@Composable
private fun CallAudioRouteRow(route: CallAudioRoute, selected: Boolean, accent: Color, onClick: () -> Unit) {
    val name = route.displayName()
    val selectedLabel = stringResource(R.string.call_audio_selected)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = name
                if (selected) stateDescription = selectedLabel
            }
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(route.kind.icon(), contentDescription = null, tint = if (selected) accent else MaterialTheme.colorScheme.onSurface)
        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = accent)
        else Spacer(Modifier.size(24.dp))
    }
}

@Composable
private fun BluetoothPermissionRow(onResult: (Boolean) -> Unit) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), onResult)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.call_audio_bluetooth_permission),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            onClick = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) launcher.launch(Manifest.permission.BLUETOOTH_CONNECT)
            },
            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
        ) { Text(stringResource(R.string.call_audio_bluetooth_allow)) }
    }
}
