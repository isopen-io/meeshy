package me.meeshy.ui.component.phonereachability

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
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonRules
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPresentation
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityState
import me.meeshy.sdk.model.phonereachability.PhoneUnreachableCause
import me.meeshy.sdk.phonereachability.PhoneReachabilityConsentLedger
import me.meeshy.sdk.phonereachability.PhoneReachabilityPersonSettings
import me.meeshy.sdk.phonereachability.PhoneReachabilitySettingsGateway
import me.meeshy.ui.R
import me.meeshy.ui.component.battery.BatterySwitchRow

/** Les réglages du téléphone injoignable de la session, fournis à la racine (`MainActivity`) ; absents, rien ne s'affiche. */
val LocalPhoneReachabilitySettings = staticCompositionLocalOf<PhoneReachabilitySettingsGateway?> { null }

/** La trace « proposé une fois » du consentement d'un Proche ; absente, rien ne se propose. */
val LocalPhoneReachabilityConsentLedger = staticCompositionLocalOf<PhoneReachabilityConsentLedger?> { null }

/** Où la section se pose : la fiche d'une personne, les infos d'une conversation directe, ou son profil. */
enum class PhoneReachabilityPersonSurface { PERSON_FICHE, CONVERSATION_INFO, PROFILE }

/**
 * Le téléphone injoignable d'une personne, à l'endroit où on la cherche (#18737) :
 * - partout : « Téléphone injoignable depuis 14:10 » (heure LOCALE du lecteur, le jour s'il n'est pas d'aujourd'hui) et
 *   la cause probable, seulement quand son téléphone est injoignable ;
 * - fiche et profil de la personne : « Prévenir {nom} si mon téléphone est injoignable » dès Proche, et UNE proposition
 *   au Proche, case non cochée (un Sang le reçoit par défaut, retirable).
 * Rien ne s'affiche sans lien qui le permette, et aucune attente ne masque un état déjà tenu.
 */
@Composable
fun PhoneReachabilityPersonSection(
    userId: String,
    name: String,
    surface: PhoneReachabilityPersonSurface,
    modifier: Modifier = Modifier,
) {
    val state = rememberPhoneReachability(userId)
    val gateway = LocalPhoneReachabilitySettings.current
    val offersSharing = gateway != null && surface != PhoneReachabilityPersonSurface.CONVERSATION_INFO
    if (state == null && !offersSharing) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state?.let { PhoneReachabilityDetailCard(it) }
        if (offersSharing && gateway != null) SharePart(userId = userId, name = name, gateway = gateway)
    }
}

/** « Téléphone injoignable depuis 14:10 » et la cause probable ; « depuis » se recalcule chaque minute (passage de minuit). */
@Composable
fun PhoneReachabilityDetailCard(state: PhoneReachabilityState, modifier: Modifier = Modifier) {
    val nowMs by rememberMinuteClock()
    val locale = LocalConfiguration.current.locales[0]
    val since = remember(state.unreachableSinceMillis, nowMs, locale) {
        PhoneReachabilityPresentation.sinceText(state.unreachableSinceMillis, nowMs, ZoneId.systemDefault(), locale)
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PhoneUnreachableGlyph(size = 20.dp)
            Text(stringResource(R.string.phone_reachability_card_since, since), style = MaterialTheme.typography.titleSmall)
        }
        causeRes(state.cause)?.let { res ->
            Text(stringResource(res), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun causeRes(cause: PhoneUnreachableCause): Int? = when (cause) {
    PhoneUnreachableCause.BATTERY -> R.string.phone_reachability_cause_battery
    PhoneUnreachableCause.NETWORK -> R.string.phone_reachability_cause_network
    PhoneUnreachableCause.UNKNOWN -> null
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
private fun SharePart(userId: String, name: String, gateway: PhoneReachabilitySettingsGateway) {
    val ledger = LocalPhoneReachabilityConsentLedger.current
    val scope = rememberCoroutineScope()
    var settings by remember(userId) { mutableStateOf<PhoneReachabilityPersonSettings?>(null) }
    val sharingEnabled by gateway.sharingEnabled.collectAsStateWithLifecycle()
    LaunchedEffect(gateway, userId) {
        settings = gateway.personSettings(userId)
        if (gateway.sharingEnabled.value == null) gateway.loadSharing()
    }
    val loaded = settings ?: return
    if (!PhoneReachabilityPersonRules.mayShare(loaded.level)) return
    val globalOn = sharingEnabled != false
    val offered = ledger?.wasOffered(userId) ?: true
    val onShare: (Boolean) -> Unit = { shared ->
        val before = loaded
        settings = loaded.copy(shared = shared)
        scope.launch { if (!gateway.setShared(userId, shared)) settings = before }
    }
    val proposes = remember(loaded.level) {
        PhoneReachabilityPersonRules.offersConsent(loaded.level, loaded.shared, offered, globalOn)
    }
    if (proposes) {
        PhoneReachabilityConsentPrompt(name = name, onShown = { ledger?.markOffered(userId) }, onConfirm = { onShare(true) })
    }
    BatterySwitchRow(
        title = stringResource(R.string.phone_reachability_share_person, name),
        hint = if (globalOn) {
            stringResource(R.string.phone_reachability_share_person_scope, name)
        } else {
            stringResource(R.string.phone_reachability_share_global_scope)
        },
        checked = loaded.shared && globalOn,
        enabled = globalOn,
        onChange = onShare,
    )
}

/** La proposition au Proche : posée une fois, la case n'est JAMAIS cochée d'avance. */
@Composable
private fun PhoneReachabilityConsentPrompt(name: String, onShown: () -> Unit, onConfirm: () -> Unit) {
    var visible by rememberSaveable { mutableStateOf(true) }
    var checked by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) { onShown() }
    if (!visible) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(stringResource(R.string.phone_reachability_consent_title, name), style = MaterialTheme.typography.titleSmall)
        Text(
            stringResource(R.string.phone_reachability_consent_body, name),
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
            Text(stringResource(R.string.phone_reachability_consent_checkbox, name), style = MaterialTheme.typography.bodyLarge)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { visible = false }) { Text(stringResource(R.string.phone_reachability_consent_later)) }
            TextButton(
                enabled = checked,
                onClick = {
                    visible = false
                    onConfirm()
                },
            ) { Text(stringResource(R.string.phone_reachability_consent_confirm)) }
        }
    }
}

/** « Prévenir mes Proches si mon téléphone est injoignable », pour tous — côté émetteur, dans mon profil. */
@Composable
fun PhoneReachabilitySharingSwitch(modifier: Modifier = Modifier) {
    val gateway = LocalPhoneReachabilitySettings.current ?: return
    val scope = rememberCoroutineScope()
    val enabled by gateway.sharingEnabled.collectAsStateWithLifecycle()
    LaunchedEffect(gateway) { gateway.loadSharing() }
    val known = enabled ?: return
    BatterySwitchRow(
        title = stringResource(R.string.phone_reachability_share_global_title),
        hint = stringResource(R.string.phone_reachability_share_global_scope),
        checked = known,
        enabled = true,
        onChange = { next -> scope.launch { gateway.setSharing(next) } },
        modifier = modifier,
    )
}
