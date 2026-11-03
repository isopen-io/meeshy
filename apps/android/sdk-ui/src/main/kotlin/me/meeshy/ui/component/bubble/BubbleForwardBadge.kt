package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.ForwardAttribution
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.MeeshySpacing

/**
 * « Transféré » : flèche pleine et libellé en caption italique `textMuted`, sur UNE ligne, au-dessus de la bulle
 * (iOS `BubbleForwardedIndicator`). Le libellé suit l'[attribution] déjà tranchée par `ForwardBadgePolicy` :
 * jamais de nom que la politique n'a pas rendu.
 */
@Composable
internal fun BubbleForwardBadge(attribution: ForwardAttribution, modifier: Modifier = Modifier) {
    val muted = MeeshyTheme.tokens.textMuted
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = modifier
            .padding(horizontal = MeeshySpacing.xs)
            .padding(bottom = MeeshySpacing.xxs)
            .semantics(mergeDescendants = true) {},
    ) {
        Icon(
            imageVector = MeeshyIcons.ForwardMessage,
            contentDescription = null,
            tint = muted,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = forwardBadgeLabel(attribution),
            style = MaterialTheme.typography.labelSmall,
            fontStyle = FontStyle.Italic,
            color = muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Le libellé de [attribution] : « Transféré depuis <groupe> », « Transf. de <personne> », ou « Transféré ». */
@Composable
internal fun forwardBadgeLabel(attribution: ForwardAttribution): String = when (attribution) {
    is ForwardAttribution.Group -> stringResource(R.string.bubble_forwarded_from, attribution.name)
    is ForwardAttribution.Person -> stringResource(R.string.bubble_forwarded_from_person, attribution.name)
    ForwardAttribution.Anonymous -> stringResource(R.string.bubble_forwarded)
}
