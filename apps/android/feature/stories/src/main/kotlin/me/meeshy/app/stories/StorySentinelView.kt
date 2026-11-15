package me.meeshy.app.stories

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La sentinelle d'un format plus récent (iOS `StorySentinelView`, vue `2j`) : elle dit ce qui manque, ce qui est
 * intact, puis le seul geste utile — dans cet ordre. Elle ne peint que la zone de la scène ; barres, avatar et
 * fermeture restent ceux du lecteur. Fond sombre uni : jamais une image par défaut à la place de la scène.
 * Elle ne nomme pas les kinds inconnus (identifiants de protocole que le lecteur ne peut pas exploiter).
 */
@Composable
internal fun StorySentinelView(onUpdate: () -> Unit, onSkip: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().background(MeeshyPalette.Indigo950).padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(132.dp)
                .clip(RoundedCornerShape(24.dp))
                .border(BorderStroke(2.dp, MeeshyPalette.Indigo400.copy(alpha = 0.7f)), RoundedCornerShape(24.dp)),
        ) {
            Icon(MeeshyIcons.Diamond, contentDescription = null, tint = MeeshyPalette.Indigo400, modifier = Modifier.size(30.dp))
        }
        Text(
            text = stringResource(R.string.story_sentinel_title),
            color = MeeshyPalette.White,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 28.dp, bottom = 16.dp),
        )
        Text(
            text = stringResource(R.string.story_sentinel_body),
            color = MeeshyPalette.White.copy(alpha = 0.72f),
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 32.dp),
        )
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(RoundedCornerShape(26.dp))
                .background(MeeshyPalette.Indigo400)
                .clickable(role = Role.Button, onClick = onUpdate),
        ) {
            Text(
                text = stringResource(R.string.story_sentinel_update),
                color = MeeshyPalette.Indigo950,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.padding(top = 12.dp).fillMaxWidth().height(48.dp).clickable(role = Role.Button, onClick = onSkip),
        ) {
            Text(
                text = stringResource(R.string.story_sentinel_skip),
                color = MeeshyPalette.White.copy(alpha = 0.66f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
