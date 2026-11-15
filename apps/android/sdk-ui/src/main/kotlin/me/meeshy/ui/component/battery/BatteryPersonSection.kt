package me.meeshy.ui.component.battery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.sdk.battery.BatteryConsentLedger
import me.meeshy.sdk.battery.BatteryPersonSettings
import me.meeshy.sdk.battery.BatteryPullOutcome
import me.meeshy.sdk.battery.BatterySettingsGateway
import me.meeshy.sdk.model.battery.BatteryPersonRules
import me.meeshy.ui.R

/** Les réglages de batterie de la session, fournis à la racine (`MainActivity`) ; absents, aucune section ne s'affiche. */
val LocalBatterySettings = staticCompositionLocalOf<BatterySettingsGateway?> { null }

/** La trace « proposé une fois » du consentement d'un Proche ; absente, rien ne se propose. */
val LocalBatteryConsentLedger = staticCompositionLocalOf<BatteryConsentLedger?> { null }

/**
 * Où la section se pose : la fiche d'une personne (ce que JE partage), les infos de conversation (ce que je reçois), ou
 * son profil (le détail seul).
 */
enum class BatteryPersonSurface { PERSON_FICHE, CONVERSATION_INFO, PROFILE }

/**
 * La batterie d'une personne, à l'endroit où on la cherche (#14147) :
 * - partout : le détail de son état quand elle est en épisode, « Demander un relevé » pour un Sang ;
 * - fiche : « Partager ma batterie avec X » dès Proche, et UNE proposition au Proche, case non cochée ;
 * - infos de conversation : ce que je reçois d'elle (tout, critique, SyncPill, rien).
 * Rien ne s'affiche sans lien qui le permette, et aucune attente ne masque un état déjà tenu.
 */
@Composable
fun BatteryPersonSection(userId: String, name: String, surface: BatteryPersonSurface, nowMs: Long, modifier: Modifier = Modifier) {
    val gateway = LocalBatterySettings.current ?: return
    val ledger = LocalBatteryConsentLedger.current
    val scope = rememberCoroutineScope()
    val state = rememberBattery(userId)
    var settings by remember(userId) { mutableStateOf<BatteryPersonSettings?>(null) }
    var pullOutcome by remember(userId) { mutableStateOf<BatteryPullOutcome?>(null) }
    val sharingEnabled by gateway.sharingEnabled.collectAsStateWithLifecycle()

    LaunchedEffect(gateway, userId) {
        settings = gateway.personSettings(userId)
        if (gateway.sharingEnabled.value == null) gateway.loadSharing()
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state?.let { served ->
            BatteryDetailCard(
                state = served,
                nowMs = nowMs,
                canPull = settings?.level?.let(BatteryPersonRules::mayPull) == true,
                pullOutcome = pullOutcome,
                onPull = { scope.launch { pullOutcome = gateway.pull(userId) } },
            )
        }
        val loaded = settings ?: return@Column
        if (!BatteryPersonRules.mayShare(loaded.level)) return@Column
        when (surface) {
            BatteryPersonSurface.PERSON_FICHE -> SharePart(
                name = name,
                settings = loaded,
                sharingEnabled = sharingEnabled != false,
                offered = ledger?.wasOffered(userId) ?: true,
                onOffered = { ledger?.markOffered(userId) },
                onShare = { shared ->
                    val before = loaded
                    settings = loaded.copy(shared = shared)
                    scope.launch { if (!gateway.setShared(userId, shared)) settings = before }
                },
            )
            BatteryPersonSurface.CONVERSATION_INFO -> BatteryReceiveModePicker(
                name = name,
                selected = loaded.receive,
                enabled = true,
                onSelect = { mode ->
                    val before = loaded
                    settings = loaded.copy(receive = mode)
                    scope.launch { if (!gateway.setReceive(userId, mode)) settings = before }
                },
            )
            BatteryPersonSurface.PROFILE -> Unit
        }
    }
}

@Composable
private fun SharePart(
    name: String,
    settings: BatteryPersonSettings,
    sharingEnabled: Boolean,
    offered: Boolean,
    onOffered: () -> Unit,
    onShare: (Boolean) -> Unit,
) {
    val proposes = remember(settings.level) {
        BatteryPersonRules.offersConsent(settings.level, settings.shared, offered, sharingEnabled)
    }
    if (proposes) {
        BatteryConsentPrompt(name = name, onShown = onOffered, onConfirm = { onShare(true) })
    }
    BatterySwitchRow(
        title = stringResource(R.string.battery_share_person, name),
        hint = stringResource(if (sharingEnabled) R.string.battery_share_person_hint else R.string.battery_share_global_hint, name),
        checked = settings.shared && sharingEnabled,
        enabled = sharingEnabled,
        onChange = onShare,
    )
}

/** La proposition au Proche : posée une fois, la case n'est JAMAIS cochée d'avance. */
@Composable
private fun BatteryConsentPrompt(name: String, onShown: () -> Unit, onConfirm: () -> Unit) {
    var visible by rememberSaveable { mutableStateOf(true) }
    var checked by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) { onShown() }
    if (!visible) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(stringResource(R.string.battery_consent_title, name), style = MaterialTheme.typography.titleSmall)
        Text(
            stringResource(R.string.battery_consent_body, name),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .toggleable(value = checked, role = Role.Checkbox, onValueChange = { checked = it }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = checked, onCheckedChange = null)
            Text(stringResource(R.string.battery_consent_checkbox, name), style = MaterialTheme.typography.bodyLarge)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { visible = false }) { Text(stringResource(R.string.battery_consent_later)) }
            TextButton(
                enabled = checked,
                onClick = {
                    visible = false
                    onConfirm()
                },
            ) { Text(stringResource(R.string.battery_consent_confirm)) }
        }
    }
}

/** « Partager ma batterie », pour tous — côté émetteur, dans mon profil. Dit ce qu'Android permet, sans rien simuler. */
@Composable
fun BatterySharingSwitch(modifier: Modifier = Modifier) {
    val gateway = LocalBatterySettings.current ?: return
    val scope = rememberCoroutineScope()
    val enabled by gateway.sharingEnabled.collectAsStateWithLifecycle()
    LaunchedEffect(gateway) { gateway.loadSharing() }
    val known = enabled ?: return
    BatterySwitchRow(
        title = stringResource(R.string.battery_share_global_title),
        hint = stringResource(R.string.battery_share_global_hint),
        checked = known,
        enabled = true,
        onChange = { next -> scope.launch { gateway.setSharing(next) } },
        modifier = modifier,
    )
}
