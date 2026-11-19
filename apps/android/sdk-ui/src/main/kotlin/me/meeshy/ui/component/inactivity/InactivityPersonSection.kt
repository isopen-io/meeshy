package me.meeshy.ui.component.inactivity

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.inactivity.InactivityPersonSettings
import me.meeshy.sdk.inactivity.InactivitySettingsGateway
import me.meeshy.sdk.model.inactivity.InactivityAlertState
import me.meeshy.sdk.model.inactivity.InactivityDelayChoice
import me.meeshy.sdk.model.inactivity.InactivityPersonRules
import me.meeshy.sdk.model.inactivity.InactivityPresentation
import me.meeshy.ui.R
import me.meeshy.ui.component.battery.BatterySwitchRow

/** Les réglages de la vérification d'inactivité de la session, fournis à la racine (`MainActivity`) ; absents, rien ne s'affiche. */
val LocalInactivitySettings = staticCompositionLocalOf<InactivitySettingsGateway?> { null }

/** Où la section se pose : la fiche d'une personne, les infos d'une conversation directe, ou son profil. */
enum class InactivityPersonSurface { PERSON_FICHE, CONVERSATION_INFO, PROFILE }

/**
 * La vérification d'inactivité d'une personne, à l'endroit où on la cherche (#18738) :
 * - partout : « Aucune activité depuis 8:00 » (heure LOCALE du lecteur), la dernière batterie et l'accès à la dernière
 *   position SEULEMENT s'ils sont servis, et seulement pendant une alerte ;
 * - fiche et profil d'un Sang : « Prévenir {nom} si je ne réponds pas » (accordé par défaut, retirable).
 * Un signal n'est jamais un message de conversation.
 */
@Composable
fun InactivityPersonSection(
    userId: String,
    name: String,
    surface: InactivityPersonSurface,
    modifier: Modifier = Modifier,
) {
    val state = rememberInactivity(userId)
    val gateway = LocalInactivitySettings.current
    val offersSharing = gateway != null && surface != InactivityPersonSurface.CONVERSATION_INFO
    if (state == null && !offersSharing) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state?.let { InactivityDetailCard(it) }
        if (offersSharing && gateway != null) SharePart(userId = userId, name = name, gateway = gateway)
    }
}

/** « Aucune activité depuis 8:00 », « Batterie 9 % » et « Voir la dernière position » ; l'heure se recalcule chaque minute. */
@Composable
fun InactivityDetailCard(state: InactivityAlertState, modifier: Modifier = Modifier) {
    val nowMs by rememberMinuteClock()
    val locale = LocalConfiguration.current.locales[0]
    val context = LocalContext.current
    val since = remember(state.inactiveSinceMillis, nowMs, locale) {
        InactivityPresentation.sinceText(state.inactiveSinceMillis, nowMs, ZoneId.systemDefault(), locale)
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InactivityGlyph(size = 20.dp)
            Text(stringResource(R.string.inactivity_card_since, since), style = MaterialTheme.typography.titleSmall)
        }
        state.lastBattery?.let { battery ->
            Text(
                stringResource(R.string.inactivity_battery, InactivityPresentation.batteryPercent(battery)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        state.lastPosition?.let { position ->
            TextButton(
                modifier = Modifier.heightIn(min = 48.dp),
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(InactivityPresentation.mapUri(position)))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try {
                        context.startActivity(intent)
                    } catch (_: ActivityNotFoundException) {
                        // Aucune application de carte : le bouton ne fait rien plutôt que de planter.
                    }
                },
            ) { Text(stringResource(R.string.inactivity_open_map)) }
        }
    }
}

@Composable
private fun rememberMinuteClock(): State<Long> = produceState(initialValue = System.currentTimeMillis()) {
    while (true) {
        delay(CLOCK_TICK_MS)
        value = System.currentTimeMillis()
    }
}

private const val CLOCK_TICK_MS: Long = 60_000L

@Composable
private fun SharePart(userId: String, name: String, gateway: InactivitySettingsGateway) {
    val scope = rememberCoroutineScope()
    var settings by remember(userId) { mutableStateOf<InactivityPersonSettings?>(null) }
    val delayChoice by gateway.delay.collectAsStateWithLifecycle()
    LaunchedEffect(gateway, userId) {
        settings = gateway.personSettings(userId)
        if (gateway.delay.value == null) gateway.loadDelay()
    }
    val loaded = settings ?: return
    if (!InactivityPersonRules.mayShare(loaded.level)) return
    val globalOn = delayChoice != InactivityDelayChoice.OFF
    BatterySwitchRow(
        title = stringResource(R.string.inactivity_share_person, name),
        hint = if (globalOn) stringResource(R.string.inactivity_share_person_scope, name) else stringResource(R.string.inactivity_share_off),
        checked = loaded.shared && globalOn,
        enabled = globalOn,
        onChange = { shared ->
            val before = loaded
            settings = loaded.copy(shared = shared)
            scope.launch { if (!gateway.setShared(userId, shared)) settings = before }
        },
    )
}

/** « Vérification d'inactivité » : 6 h / 12 h / 24 h / Désactivée — le délai, pour tous, dans MON profil. */
@Composable
fun InactivityDelaySetting(modifier: Modifier = Modifier) {
    val gateway = LocalInactivitySettings.current ?: return
    val scope = rememberCoroutineScope()
    val selected by gateway.delay.collectAsStateWithLifecycle()
    LaunchedEffect(gateway) { gateway.loadDelay() }
    val known = selected ?: return
    Column(modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(stringResource(R.string.inactivity_delay_title), style = MaterialTheme.typography.bodyLarge)
        Text(
            stringResource(R.string.inactivity_delay_scope),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        InactivityDelayChoice.entries.forEach { choice ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .selectable(selected = choice == known, role = Role.RadioButton, onClick = {
                        if (choice != known) scope.launch { gateway.setDelay(choice) }
                    }),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                RadioButton(selected = choice == known, onClick = null)
                Text(stringResource(choice.labelRes()), style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}

private fun InactivityDelayChoice.labelRes(): Int = when (this) {
    InactivityDelayChoice.SIX_HOURS -> R.string.inactivity_delay_6h
    InactivityDelayChoice.TWELVE_HOURS -> R.string.inactivity_delay_12h
    InactivityDelayChoice.TWENTY_FOUR_HOURS -> R.string.inactivity_delay_24h
    InactivityDelayChoice.OFF -> R.string.inactivity_delay_off
}
