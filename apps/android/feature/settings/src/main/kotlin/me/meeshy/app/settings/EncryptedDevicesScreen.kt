package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.e2ee.EncryptedDevicePlatform
import me.meeshy.sdk.model.e2ee.OwnEncryptedDevice
import me.meeshy.ui.component.chrome.CollapsibleHeaderLazyPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Réglages › Sécurité › « Mes appareils chiffrés » (#13014, jumelle Android de #13009). Ce
 * téléphone n'est pas encore un appareil chiffré (pile libsignal : #13015) : l'écran liste et
 * retire, et dit pourquoi il ne montre ni code ni lecteur (approbation par QR : #13016).
 */
@Composable
fun EncryptedDevicesScreen(
    onBack: () -> Unit,
    viewModel: EncryptedDevicesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    EncryptedDeviceDialogs(
        state = state,
        onConfirm = viewModel::confirmRetire,
        onCancel = viewModel::cancelRetire,
        onDismissFailure = viewModel::dismissRetireFailure,
    )
    MeeshyBackground {
        CollapsibleHeaderLazyPage(
            title = stringResource(R.string.encrypted_devices_title),
            onBack = onBack,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
            contentPadding = PaddingValues(start = MeeshySpacing.lg, end = MeeshySpacing.lg, bottom = MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            item(key = "notice") { NotYetEncryptedNotice() }
            when (val content = state.content()) {
                EncryptedDevicesContent.Loading -> item(key = "loading") { LoadingRow() }
                is EncryptedDevicesContent.Unreachable -> item(key = "unreachable") {
                    UnreachableState(content.failure, onRetry = viewModel::refresh)
                }
                is EncryptedDevicesContent.Empty -> {
                    content.staleBecause?.let { failure -> item(key = "stale") { StaleBanner(failure, viewModel::refresh) } }
                    item(key = "empty") { EmptyState() }
                }
                is EncryptedDevicesContent.Listed -> {
                    content.staleBecause?.let { failure -> item(key = "stale") { StaleBanner(failure, viewModel::refresh) } }
                    items(content.devices, key = { it.deviceId }) { device ->
                        EncryptedDeviceRow(
                            device = device,
                            isRetiring = device.deviceId in state.retiringIds,
                            onRetire = { viewModel.requestRetire(device) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotYetEncryptedNotice() {
    MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(MeeshySpacing.md).semantics(mergeDescendants = true) {}) {
            Icon(MeeshyIcons.Shield, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(MeeshySpacing.sm))
            Column {
                Text(
                    text = stringResource(R.string.encrypted_devices_notice_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(R.string.encrypted_devices_notice_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }
    }
}

@Composable
private fun LoadingRow() {
    val label = stringResource(R.string.encrypted_devices_loading)
    Box(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
    }
}

@Composable
private fun UnreachableState(failure: EncryptedDevicesFailure, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(
                if (failure == EncryptedDevicesFailure.OFFLINE) R.string.encrypted_devices_offline_empty else R.string.encrypted_devices_error,
            ),
            color = if (failure == EncryptedDevicesFailure.OFFLINE) MeeshyTheme.tokens.textMuted else MeeshyPalette.Error,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(stringResource(R.string.encrypted_devices_retry))
        }
    }
}

@Composable
private fun StaleBanner(failure: EncryptedDevicesFailure, onRetry: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(
                if (failure == EncryptedDevicesFailure.OFFLINE) R.string.encrypted_devices_offline else R.string.encrypted_devices_stale,
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(stringResource(R.string.encrypted_devices_retry))
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl).semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.Devices, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(36.dp))
        Text(
            text = stringResource(R.string.encrypted_devices_empty_title),
            style = MaterialTheme.typography.titleSmall,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.encrypted_devices_empty_body),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

@Composable
private fun EncryptedDeviceRow(device: OwnEncryptedDevice, isRetiring: Boolean, onRetire: () -> Unit) {
    val title = deviceTitle(device)
    val platform = stringResource(platformName(device.platform))
    val locale = LocalConfiguration.current.locales[0]
    val dates = stringResource(
        R.string.encrypted_devices_dates,
        deviceDate(device.enrolledAt, locale),
        deviceDate(device.lastSeenAt, locale),
    )
    MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(MeeshySpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (device.isCurrent) MeeshyPalette.Success else MeeshyPalette.Indigo500),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (device.platform == EncryptedDevicePlatform.WEB) MeeshyIcons.Globe else MeeshyIcons.Devices,
                    contentDescription = null,
                    tint = MeeshyPalette.White,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                Text(text = title, style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
                Text(text = platform, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted, maxLines = 1)
                Text(text = dates, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
                if (device.isCurrent) {
                    Text(
                        text = stringResource(R.string.encrypted_devices_current),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyPalette.Success,
                    )
                }
            }
            RetireControl(device = device, title = title, isRetiring = isRetiring, onRetire = onRetire)
        }
    }
}

@Composable
private fun RetireControl(device: OwnEncryptedDevice, title: String, isRetiring: Boolean, onRetire: () -> Unit) {
    if (!device.isRetirable) return
    if (isRetiring) {
        val label = stringResource(R.string.encrypted_devices_retiring, title)
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp).semantics { contentDescription = label },
            strokeWidth = 2.dp,
        )
        return
    }
    val label = stringResource(R.string.encrypted_devices_retire_a11y, title)
    TextButton(
        onClick = onRetire,
        modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = label },
    ) {
        Text(text = stringResource(R.string.encrypted_devices_retire), color = MeeshyPalette.Error)
    }
}

@Composable
private fun EncryptedDeviceDialogs(
    state: EncryptedDevicesUiState,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    onDismissFailure: () -> Unit,
) {
    state.pendingRetirement?.let { device ->
        AlertDialog(
            onDismissRequest = onCancel,
            title = { Text(stringResource(R.string.encrypted_devices_retire_confirm_title)) },
            text = { Text(stringResource(R.string.encrypted_devices_retire_confirm_message, deviceTitle(device))) },
            confirmButton = {
                TextButton(onClick = onConfirm) {
                    Text(stringResource(R.string.encrypted_devices_retire_confirm_action), color = MeeshyPalette.Error)
                }
            },
            dismissButton = { TextButton(onClick = onCancel) { Text(stringResource(R.string.encrypted_devices_cancel)) } },
        )
    }
    state.retireFailure?.let { failure ->
        AlertDialog(
            onDismissRequest = onDismissFailure,
            text = {
                Text(
                    stringResource(
                        if (failure == EncryptedDevicesFailure.OFFLINE) {
                            R.string.encrypted_devices_retire_offline
                        } else {
                            R.string.encrypted_devices_retire_failed
                        },
                    ),
                )
            },
            confirmButton = { TextButton(onClick = onDismissFailure) { Text(stringResource(R.string.encrypted_devices_ok)) } },
        )
    }
}

@Composable
internal fun deviceTitle(device: OwnEncryptedDevice): String =
    device.label ?: stringResource(R.string.encrypted_devices_unnamed, stringResource(platformName(device.platform)), device.deviceId)

internal fun platformName(platform: EncryptedDevicePlatform): Int = when (platform) {
    EncryptedDevicePlatform.IOS -> R.string.encrypted_devices_platform_ios
    EncryptedDevicePlatform.MACOS -> R.string.encrypted_devices_platform_macos
    EncryptedDevicePlatform.ANDROID -> R.string.encrypted_devices_platform_android
    EncryptedDevicePlatform.WEB -> R.string.encrypted_devices_platform_web
    EncryptedDevicePlatform.UNKNOWN -> R.string.encrypted_devices_platform_unknown
}

internal fun deviceDate(instant: Instant, locale: Locale, zone: ZoneId = ZoneId.systemDefault()): String =
    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).withZone(zone).format(instant)
