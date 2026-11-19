package me.meeshy.ui.component.phonecall

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.phonecall.PhoneCallPersonRules
import me.meeshy.sdk.model.phonecall.PhoneCallPresentation
import me.meeshy.sdk.model.phonecall.PhoneCallSince
import me.meeshy.sdk.model.phonecall.PhoneCallState
import me.meeshy.sdk.phonecall.PhoneCallPersonSettings
import me.meeshy.sdk.phonecall.PhoneCallSettingsGateway
import me.meeshy.ui.R
import me.meeshy.ui.component.battery.BatterySwitchRow

/** Les réglages « en appel » de la session, fournis à la racine (`MainActivity`) ; absents, rien ne s'affiche. */
val LocalPhoneCallSettings = staticCompositionLocalOf<PhoneCallSettingsGateway?> { null }

/** Où la section se pose : la fiche d'une personne, les infos d'une conversation directe, ou son profil. */
enum class PhoneCallPersonSurface { PERSON_FICHE, CONVERSATION_INFO, PROFILE }

/**
 * « En appel » d'une personne, à l'endroit où on le cherche (#18753) :
 * - partout : « En appel depuis 12 min » / « En appel depuis 14:00 » (heure LOCALE du lecteur), jamais d'interlocuteur ;
 * - fiche et profil d'un Sang (l'équipe y est servie au niveau Sang) : « Montrer à {nom} que je suis en appel »
 *   (accordé par défaut, retirable), optimiste avec retour arrière sur un refus.
 * Un signal n'est jamais un message de conversation.
 */
@Composable
fun PhoneCallPersonSection(
    userId: String,
    name: String,
    surface: PhoneCallPersonSurface,
    modifier: Modifier = Modifier,
) {
    val state = rememberPhoneCall(userId)
    val gateway = LocalPhoneCallSettings.current
    val offersSharing = gateway != null && surface != PhoneCallPersonSurface.CONVERSATION_INFO
    if (state == null && !offersSharing) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state?.let { PhoneCallSinceLine(it) }
        if (offersSharing && gateway != null) SharePart(userId = userId, name = name, gateway = gateway)
    }
}

/** « En appel depuis 12 min » ou « En appel depuis 14:00 » ; le libellé se recalcule chaque minute. */
@Composable
fun PhoneCallSinceLine(state: PhoneCallState, modifier: Modifier = Modifier) {
    val nowMs by rememberMinuteClock()
    val locale = LocalConfiguration.current.locales[0]
    val since = remember(state.sinceMillis, nowMs, locale) {
        PhoneCallPresentation.since(state.sinceMillis, nowMs, ZoneId.systemDefault(), locale)
    }
    val text = when (since) {
        is PhoneCallSince.Minutes -> stringResource(R.string.phone_call_since_minutes, since.minutes)
        is PhoneCallSince.Clock -> stringResource(R.string.phone_call_since_clock, since.text)
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PhoneCallGlyph(size = 20.dp)
        Text(text, style = MaterialTheme.typography.titleSmall)
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
private fun SharePart(userId: String, name: String, gateway: PhoneCallSettingsGateway) {
    val scope = rememberCoroutineScope()
    var settings by remember(userId) { mutableStateOf<PhoneCallPersonSettings?>(null) }
    val sharing by gateway.sharingEnabled.collectAsStateWithLifecycle()
    LaunchedEffect(gateway, userId) {
        settings = gateway.personSettings(userId)
        if (gateway.sharingEnabled.value == null) gateway.loadSharing()
    }
    val loaded = settings ?: return
    if (!PhoneCallPersonRules.mayShare(loaded.level)) return
    val globalOn = sharing != false
    BatterySwitchRow(
        title = stringResource(R.string.phone_call_share_person, name),
        hint = if (globalOn) stringResource(R.string.phone_call_share_person_scope, name) else stringResource(R.string.phone_call_share_off),
        checked = loaded.shared && globalOn,
        enabled = globalOn,
        onChange = { shared ->
            val before = loaded
            settings = loaded.copy(shared = shared)
            scope.launch { if (!gateway.setShared(userId, shared)) settings = before }
        },
    )
}

/** « Montrer à mes Sangs que je suis en appel » : la coupure globale, côté émetteur, dans MON profil. */
@Composable
fun PhoneCallSharingSwitch(modifier: Modifier = Modifier) {
    val gateway = LocalPhoneCallSettings.current ?: return
    val scope = rememberCoroutineScope()
    val enabled by gateway.sharingEnabled.collectAsStateWithLifecycle()
    LaunchedEffect(gateway) { gateway.loadSharing() }
    val known = enabled ?: return
    BatterySwitchRow(
        title = stringResource(R.string.phone_call_share_global_title),
        hint = stringResource(R.string.phone_call_share_global_scope),
        checked = known,
        enabled = true,
        onChange = { next -> scope.launch { gateway.setSharing(next) } },
        modifier = modifier,
    )
}
