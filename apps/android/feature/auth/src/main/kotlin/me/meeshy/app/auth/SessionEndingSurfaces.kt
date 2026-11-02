package me.meeshy.app.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.auth.R
import me.meeshy.ui.theme.MeeshySpacing

private const val VEIL_ALPHA = 0.55f

/**
 * iOS `SettingsView` : pendant la fermeture de session, un voile « Déconnexion en cours… »
 * recouvre l'app et absorbe tout toucher (plus de double appui, plus d'écran sur une session
 * déjà purgée).
 */
@Composable
fun LoggingOutVeil(visible: Boolean) {
    if (!visible) return
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = VEIL_ALPHA))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            CircularProgressIndicator(color = Color.White)
            Text(
                text = stringResource(R.string.logout_in_progress),
                color = Color.White,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

/** iOS `SessionClosedNoticeView` : on revient à la connexion parce que la session a été fermée, et on le dit. */
@Composable
internal fun SessionClosedNotice(onContinue: () -> Unit) {
    AlertDialog(
        onDismissRequest = onContinue,
        title = { Text(stringResource(R.string.session_closed_signed_out_title)) },
        text = { Text(stringResource(R.string.session_closed_signed_out_message)) },
        confirmButton = {
            TextButton(onClick = onContinue) { Text(stringResource(R.string.session_closed_continue)) }
        },
    )
}
