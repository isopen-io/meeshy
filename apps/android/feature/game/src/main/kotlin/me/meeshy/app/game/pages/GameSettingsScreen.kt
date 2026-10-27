package me.meeshy.app.game.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.GameErrorMessages
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LES RÉGLAGES DU JEU (iOS `GameSettingsPage`) — « Célébrations » (cet appareil), « Jeu masqué » (cet appareil ET le
 * serveur), qui voit quoi (tel que servi) et l'opposition à la ligue Amis. Hors ligne, masquer est suspendu : le dire à
 * l'écran plutôt que de promettre un masquage que les autres ne verraient pas ; réafficher marche toujours.
 *
 * Les visibilités se LISENT ici ; les changer est une écriture d'une partie suivante, avec le rangement de la vitrine.
 */
@Composable
fun GameSettingsScreen(
    onBack: () -> Unit,
    viewModel: GameSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GamePageHost(title = stringResource(R.string.game2_settings_title), onBack = onBack) { game ->
        CelebrationsCard(state.prefs.celebrations, viewModel::setCelebrations)
        HiddenCard(state, viewModel::setHidden)
        game.visibility?.let { VisibilityCard(it) }
        game.league?.let { league -> LeagueCard(inLeague = league.access == LeagueAccess.Open, pseudonym = league.pseudonym) }
        FriendsLeagueCard(state, viewModel::setFriendsLeagueOptOut)
    }
}

@Composable
private fun CelebrationsCard(on: Boolean, onChange: (Boolean) -> Unit) {
    GameCard(title = stringResource(R.string.game2_settings_celebrations_title)) {
        GameNote(stringResource(R.string.game2_settings_celebrations_body))
        GameSwitchRow(stringResource(R.string.game2_settings_celebrations_switch), on, onChange = onChange)
    }
}

@Composable
private fun HiddenCard(state: GameSettingsUiState, onChange: (Boolean) -> Unit) {
    val hidden = state.prefs.hidden
    GameCard(title = stringResource(R.string.game2_settings_hidden_title)) {
        GameNote(stringResource(R.string.game2_settings_hidden_body))
        GameSwitchRow(
            label = stringResource(R.string.game2_settings_hidden_switch),
            on = hidden,
            enabled = !state.hideBusy,
            onChange = onChange,
        )
        if (hidden) GameNote(stringResource(R.string.game2_settings_hidden_reopen_note))
        GameErrorLine(refusalMessage(state.hideRefusal))
    }
}

@Composable
private fun VisibilityCard(visibility: GameVisibility) {
    GameCard(title = stringResource(R.string.game2_settings_visibility_title)) {
        GameNote(stringResource(R.string.game2_settings_visibility_body))
        listOf(
            R.string.game2_visibility_field_rank to visibility.rank,
            R.string.game2_visibility_field_treasury to visibility.treasury,
            R.string.game2_visibility_field_showcase to visibility.showcase,
            R.string.game2_visibility_field_atlas to visibility.atlas,
        ).forEach { (field, level) ->
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(field), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
                Text(stringResource(visibilityRes(level)), style = MaterialTheme.typography.bodyMedium, color = MeeshyPalette.Indigo500, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun LeagueCard(inLeague: Boolean, pseudonym: String?) {
    GameCard(title = stringResource(R.string.game2_settings_league_title)) {
        GameNote(
            when {
                !inLeague -> stringResource(R.string.game2_settings_league_off)
                pseudonym != null -> stringResource(R.string.game2_settings_league_on, pseudonym)
                else -> stringResource(R.string.game2_settings_league_on_unnamed)
            },
        )
    }
}

@Composable
private fun FriendsLeagueCard(state: GameSettingsUiState, onChange: (Boolean) -> Unit) {
    GameCard(title = stringResource(R.string.game2_settings_friends_league_title)) {
        GameNote(stringResource(R.string.game2_settings_friends_league_body))
        GameSwitchRow(
            label = stringResource(R.string.game2_settings_friends_league_switch),
            on = state.friendsLeagueOptedOut,
            enabled = !state.optOutBusy,
            onChange = onChange,
        )
        GameErrorLine(refusalMessage(state.optOutRefusal))
    }
}

@Composable
private fun refusalMessage(refusal: SwitchRefusal?): String? {
    val resources = LocalContext.current.resources
    return when (refusal) {
        null -> null
        SwitchRefusal.Offline -> stringResource(R.string.game2_offline_action)
        is SwitchRefusal.Code -> GameErrorMessages.message(resources, refusal.wire)
    }
}

/** Un interrupteur nommé, d'au moins 44 dp de haut : toute la ligne se touche, TalkBack lit « interrupteur ». */
@Composable
internal fun GameSwitchRow(label: String, on: Boolean, modifier: Modifier = Modifier, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .toggleable(value = on, enabled = enabled, role = Role.Switch, onValueChange = onChange),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        Switch(checked = on, onCheckedChange = null, enabled = enabled)
    }
}
