package me.meeshy.app.feed

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Une publication arrêtée par le plafond des personnes choisies sans lien (#14169) le dit en clair, avec ses nombres
 * quand la passerelle les a donnés ; elle ne se rejoue pas toute seule. Rien pour un autre échec.
 */
@Composable
internal fun OnlyUnlinkedRefusalLine(item: UnsentPublication) {
    val refusal = item.onlyUnlinkedRefusal ?: return
    val limit = refusal.limit
    val unlinked = refusal.unlinked
    Text(
        text = if (limit != null && unlinked != null) {
            stringResource(R.string.feed_unsent_only_unlinked_counted, unlinked, limit)
        } else {
            stringResource(R.string.feed_unsent_only_unlinked)
        },
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.error,
    )
}
