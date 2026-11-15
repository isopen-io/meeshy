package me.meeshy.ui.component.battery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.battery.BatteryPullOutcome
import me.meeshy.sdk.model.battery.BatteryPhase
import me.meeshy.sdk.model.battery.BatteryPresentation
import me.meeshy.sdk.model.battery.BatteryReceiveMode
import me.meeshy.sdk.model.battery.BatteryState
import me.meeshy.ui.R

private val MinTouch = 48.dp

/**
 * Le détail de la batterie d'une personne (infos de conversation, profil) : niveau, charge, mode économie, autonomie
 * estimée, « il y a X min ». Rien hors épisode : l'appelant ne monte la carte que sur un état servi. « Demander un
 * relevé » n'en fait pas partie ([BatteryPullRow]) : c'est hors épisode qu'il sert le plus.
 */
@Composable
fun BatteryDetailCard(
    state: BatteryState,
    nowMs: Long,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BatteryGlyph(BatteryGlyphModel.of(state), width = 24.dp)
            Text(stringResource(R.string.battery_detail_title), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.battery_level, state.level), style = MaterialTheme.typography.titleSmall)
        }
        batteryFacts(state, nowMs).forEach { fact ->
            Text(fact, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** « Demander un relevé », au Sang seulement — que l'état soit servi ou non ; l'issue que la passerelle rend se dit dessous. */
@Composable
fun BatteryPullRow(pullOutcome: BatteryPullOutcome?, onPull: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        TextButton(onClick = onPull, modifier = Modifier.heightIn(min = MinTouch)) {
            Text(stringResource(R.string.battery_pull))
        }
        pullOutcome?.let { outcome ->
            Text(pullOutcomeText(outcome), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun batteryFacts(state: BatteryState, nowMs: Long): List<String> {
    val facts = mutableListOf<String>()
    if (state.phase == BatteryPhase.OFF) facts += stringResource(R.string.battery_off)
    if (state.charging) facts += stringResource(R.string.battery_charging)
    if (state.lowPower) facts += stringResource(R.string.battery_low_power)
    BatteryPresentation.autonomy(state)?.let { facts += stringResource(R.string.battery_autonomy, it.hours, it.minutes) }
    val minutes = BatteryPresentation.minutesAgo(state, nowMs)
    facts += if (minutes == 0) stringResource(R.string.battery_measured_now) else stringResource(R.string.battery_measured_ago, minutes)
    return facts
}

@Composable
private fun pullOutcomeText(outcome: BatteryPullOutcome): String = when (outcome) {
    is BatteryPullOutcome.Requested ->
        stringResource(if (outcome.episodeOnly) R.string.battery_pull_episode_only else R.string.battery_pull_sent)
    BatteryPullOutcome.TooSoon -> stringResource(R.string.battery_pull_too_soon)
    BatteryPullOutcome.Forbidden -> stringResource(R.string.battery_pull_forbidden)
    BatteryPullOutcome.Unavailable -> stringResource(R.string.battery_pull_unavailable)
}

/** Un interrupteur libellé, la rangée entière cliquable (cible ≥ 48 dp, lu « interrupteur » par TalkBack). */
@Composable
fun BatterySwitchRow(title: String, hint: String?, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = MinTouch)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onChange)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            hint?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}

/** Ce que je reçois de cette personne : tout, le critique, la SyncPill seule, rien — les mots d'iOS. */
@Composable
fun BatteryReceiveModePicker(selected: BatteryReceiveMode, enabled: Boolean, onSelect: (BatteryReceiveMode) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().selectableGroup()) {
        Text(stringResource(R.string.battery_receive_title), style = MaterialTheme.typography.titleSmall)
        BatteryReceiveMode.entries.forEach { mode ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = MinTouch)
                    .selectable(selected = mode == selected, enabled = enabled, role = Role.RadioButton, onClick = { onSelect(mode) }),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(selected = mode == selected, onClick = null, enabled = enabled)
                Text(stringResource(mode.labelRes()), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

private fun BatteryReceiveMode.labelRes(): Int = when (this) {
    BatteryReceiveMode.ALL -> R.string.battery_receive_all
    BatteryReceiveMode.CRITICAL -> R.string.battery_receive_critical
    BatteryReceiveMode.PILL -> R.string.battery_receive_pill
    BatteryReceiveMode.NONE -> R.string.battery_receive_none
}
