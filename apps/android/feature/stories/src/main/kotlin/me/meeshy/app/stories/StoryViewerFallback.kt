package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'attente du lecteur avant sa première story : un indicateur discret sur fond sombre,
 * jamais un écran qui s'ouvre puis se referme (iOS `StoryViewerContainer`, chargement).
 */
@Composable
internal fun StoryViewerLoading() {
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MeeshyPalette.White, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
    }
}

/**
 * Le repli quand l'auteur demandé n'a aucune story jouable, ni en cache ni sur le réseau :
 * « Story introuvable », Réessayer, Fermer — le miroir de `StoryViewerContainer`
 * (`story.viewer.notFound.*`). Jamais la story d'un autre auteur à la place.
 */
@Composable
internal fun StoryViewerNotFound(onRetry: () -> Unit, onClose: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            modifier = Modifier.padding(MeeshySpacing.xl),
        ) {
            Icon(
                Icons.Outlined.ErrorOutline,
                contentDescription = null,
                tint = MeeshyPalette.White.copy(alpha = 0.7f),
                modifier = Modifier.size(44.dp),
            )
            Text(
                text = stringResource(R.string.stories_viewer_not_found_title),
                color = MeeshyPalette.White,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = stringResource(R.string.stories_viewer_not_found_description),
                color = MeeshyPalette.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                Button(onClick = onRetry) { Text(stringResource(R.string.stories_viewer_retry)) }
                OutlinedButton(onClick = onClose) {
                    Text(stringResource(R.string.stories_viewer_close), color = MeeshyPalette.White)
                }
            }
        }
    }
}
