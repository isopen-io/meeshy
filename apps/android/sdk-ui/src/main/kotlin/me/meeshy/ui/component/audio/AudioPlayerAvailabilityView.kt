package me.meeshy.ui.component.audio

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.boundedScale

/**
 * Bande d'erreur du lecteur (fichier illisible ou téléchargement échoué) : message sobre et
 * « Réessayer ». Le sens n'est jamais porté par la seule couleur : icône + texte.
 */
@Composable
public fun AudioPlayerErrorRow(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = stringResource(R.string.audio_player_error),
            color = MeeshyPalette.Error,
            fontSize = 11.sp.boundedScale(),
            maxLines = 2,
        )
        Row(
            modifier = Modifier
                .semantics { role = Role.Button }
                .clickable {
                    haptics.light()
                    onRetry()
                }
                .meeshyTapTarget()
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(MeeshyIcons.Refresh, null, tint = MeeshyPalette.Error, modifier = Modifier.size(14.dp).decorative())
            Text(
                text = stringResource(R.string.audio_player_retry),
                color = MeeshyPalette.Error,
                fontSize = 11.sp.boundedScale(),
            )
        }
    }
}
