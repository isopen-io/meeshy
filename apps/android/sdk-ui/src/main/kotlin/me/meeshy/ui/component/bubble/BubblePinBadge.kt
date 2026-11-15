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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * « Message épinglé » : l'épingle (12 dp, `pinnedBlue` invariant au thème) et son libellé, posés
 * AU-DESSUS de la bulle sur le fond de conversation (iOS `BubblePinnedIndicator`). Le glyphe est
 * décoratif : le libellé visible est ce que TalkBack annonce.
 */
@Composable
internal fun BubblePinBadge(modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = modifier
            .padding(horizontal = MeeshySpacing.xs)
            .padding(bottom = MeeshySpacing.xxs)
            .semantics(mergeDescendants = true) {},
    ) {
        Icon(
            imageVector = MeeshyIcons.PinFilled,
            contentDescription = null,
            tint = MeeshyPalette.PinnedBlue,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = stringResource(R.string.bubble_meta_pinned_a11y),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyPalette.PinnedBlue,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
