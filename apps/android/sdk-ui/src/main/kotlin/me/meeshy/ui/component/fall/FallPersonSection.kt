package me.meeshy.ui.component.fall

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.fall.FallPersonSettings
import me.meeshy.sdk.fall.FallSettingsGateway
import me.meeshy.sdk.model.fall.FallPersonRules
import me.meeshy.sdk.model.fall.FallPresentation
import me.meeshy.sdk.model.fall.FallState
import me.meeshy.ui.R
import me.meeshy.ui.component.battery.BatterySwitchRow

/** Le réglage par personne de la chute détectée, fourni à la racine (`MainActivity`) ; absent, rien ne s'affiche. */
val LocalFallSettings = staticCompositionLocalOf<FallSettingsGateway?> { null }

/** Où la section se pose : la fiche d'une personne, les infos d'une conversation directe, ou son profil. */
enum class FallPersonSurface { PERSON_FICHE, CONVERSATION_INFO, PROFILE }

/**
 * La chute détectée d'une personne, à l'endroit où on la cherche (#18748) :
 * - partout : « Chute détectée à 16:42 » (heure LOCALE du lecteur), la dernière batterie et l'accès à la dernière
 *   position SEULEMENT s'ils sont servis, et seulement tant que l'épisode n'a pas expiré ;
 * - fiche et profil d'un Sang : « Prévenir {nom} si ma montre détecte une chute » (accordé par défaut, retirable) —
 *   le réglage vaut pour le jour où j'aurai une Apple Watch et l'app iPhone : Android ne détecte rien lui-même.
 * Un signal n'est jamais un message de conversation.
 */
@Composable
fun FallPersonSection(userId: String, name: String, surface: FallPersonSurface, modifier: Modifier = Modifier) {
    val state = rememberFall(userId)
    val gateway = LocalFallSettings.current
    val offersSharing = gateway != null && surface != FallPersonSurface.CONVERSATION_INFO
    if (state == null && !offersSharing) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state?.let { FallDetailCard(it) }
        if (offersSharing && gateway != null) SharePart(userId = userId, name = name, gateway = gateway)
    }
}

/** « Chute détectée à 16:42 », « Batterie 41 % » et « Voir la dernière position » ; l'heure se recalcule chaque minute. */
@Composable
fun FallDetailCard(state: FallState, modifier: Modifier = Modifier) {
    val nowMs by rememberMinuteClock()
    val locale = LocalConfiguration.current.locales[0]
    val context = LocalContext.current
    val at = remember(state.detectedAtMillis, nowMs, locale) {
        FallPresentation.detectedAtText(state.detectedAtMillis, nowMs, ZoneId.systemDefault(), locale)
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FallGlyph(size = 20.dp)
            Text(stringResource(R.string.fall_card_at, at), style = MaterialTheme.typography.titleSmall)
        }
        state.lastBattery?.let { battery ->
            Text(
                stringResource(R.string.fall_battery, FallPresentation.batteryPercent(battery)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        state.lastPosition?.let { position ->
            TextButton(
                modifier = Modifier.heightIn(min = 48.dp),
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(FallPresentation.mapUri(position))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try {
                        context.startActivity(intent)
                    } catch (_: ActivityNotFoundException) {
                        // Aucune application de carte : le bouton ne fait rien plutôt que de planter.
                    }
                },
            ) { Text(stringResource(R.string.fall_open_map)) }
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
private fun SharePart(userId: String, name: String, gateway: FallSettingsGateway) {
    val scope = rememberCoroutineScope()
    var settings by remember(userId) { mutableStateOf<FallPersonSettings?>(null) }
    LaunchedEffect(gateway, userId) { settings = gateway.personSettings(userId) }
    val loaded = settings ?: return
    if (!FallPersonRules.mayShare(loaded.level)) return
    BatterySwitchRow(
        title = stringResource(R.string.fall_share_person, name),
        hint = stringResource(R.string.fall_share_person_scope, name),
        checked = loaded.shared,
        enabled = true,
        onChange = { shared ->
            val before = loaded
            settings = loaded.copy(shared = shared)
            scope.launch { if (!gateway.setShared(userId, shared)) settings = before }
        },
    )
}

/** « Détection de chute » dans MON profil : elle n'existe pas sur Android, et la ligne le dit — aucun réglage ici. */
@Composable
fun FallSelfNotice(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(stringResource(R.string.fall_me_title), style = MaterialTheme.typography.bodyLarge)
        Text(
            stringResource(R.string.fall_me_unavailable),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
