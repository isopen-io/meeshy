package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerPostTextPolicy
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * « Texte du post » (#13863 R2) : le texte du post ou du réel vit HORS de la scène, posé depuis le socle. La pastille dit ce
 * qui est écrit (ou son nom tant que rien ne l'est) ; la toucher ouvre le champ collé au clavier.
 */
@Composable
internal fun PostTextPill(text: String, onClick: () -> Unit) {
    val label = stringResource(R.string.composer_post_text)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(SCENE_TARGET)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(SOCLE_VEIL)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = label
                if (text.isNotBlank()) stateDescription = text
            }
            .padding(horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.Notes, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text(
            text = text.ifBlank { label },
            style = MaterialTheme.typography.labelLarge,
            color = Color.White.copy(alpha = if (text.isBlank()) PLACEHOLDER_ALPHA else 1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Le compteur discret du texte du post : rien sous 4 000, « utilisé / 5 000 » ensuite, en alerte dès 4 500 (comme iOS). */
@Composable
internal fun PostTextCounter(text: String) {
    val counter = ComposerPostTextPolicy.counter(text) ?: return
    Text(
        text = stringResource(R.string.composer_post_text_counter, counter.used, counter.limit),
        style = MaterialTheme.typography.bodySmall,
        color = if (counter.warns) MaterialTheme.colorScheme.error else Color.White,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xxs)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

private const val PLACEHOLDER_ALPHA = 0.7f
