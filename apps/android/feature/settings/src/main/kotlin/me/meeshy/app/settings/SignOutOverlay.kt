package me.meeshy.app.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.settings.LogoutPhase
import me.meeshy.ui.component.chrome.BlockingProgressOverlay

/** iOS `SettingsView` : « Déconnexion en cours » tant que `logout()` n'est pas revenu. */
@Composable
internal fun SignOutOverlay(phase: LogoutPhase) {
    BlockingProgressOverlay(
        visible = phase.blocksInteraction,
        label = stringResource(R.string.settings_logout_in_progress),
    )
}
