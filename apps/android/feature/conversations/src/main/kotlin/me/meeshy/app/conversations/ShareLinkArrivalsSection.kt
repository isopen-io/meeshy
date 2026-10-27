package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ShareLinkArrivalStats
import me.meeshy.sdk.model.ShareLinkArrivalsSection
import me.meeshy.sdk.model.ShareLinkStatsState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce qu'un lien a fait venir : visites, arrivées, arrivées sans compte ; les langues des arrivants ; les
 * derniers arrivés. Trois états, jamais un indicateur éternel : en chargement les tuiles montrent des
 * silhouettes à leur taille finale ; indisponibles, elles gardent leurs tirets et une ligne le dit.
 * Miroir de `ShareLinkArrivalsSection` (iOS). Le contenu apparaît en fondu quand les chiffres arrivent.
 */
@Composable
internal fun ShareLinkArrivalsSection(
    state: ShareLinkStatsState,
    onSeeAll: (total: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val stats = (state as? ShareLinkStatsState.Loaded)?.stats
    Column(modifier = modifier.fillMaxWidth().animateContentSize(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus), modifier = Modifier.fillMaxWidth()) {
            Tile(stats?.visits, stringResource(R.string.shareLink_detail_visits), state is ShareLinkStatsState.Loading, Modifier.weight(1f))
            Tile(stats?.arrivals, stringResource(R.string.shareLink_detail_arrivals), state is ShareLinkStatsState.Loading, Modifier.weight(1f))
            Tile(stats?.anonymousArrivals, stringResource(R.string.shareLink_detail_withoutAccount), state is ShareLinkStatsState.Loading, Modifier.weight(1f))
        }
        if (state is ShareLinkStatsState.Unavailable) {
            Text(
                stringResource(R.string.shareLink_detail_statsUnavailable),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        AnimatedContent(
            targetState = stats,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "arrivalsDetails",
        ) { loaded ->
            if (loaded != null) Details(loaded, onSeeAll)
        }
    }
}

@Composable
private fun Details(stats: ShareLinkArrivalStats, onSeeAll: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        val shares = stats.languageShares
        if (shares.isNotEmpty()) {
            MeeshyCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                    ShareLinkSectionTitle(stringResource(R.string.shareLink_detail_arrivalLanguages))
                    ShareLinkLanguageShareBar(shares)
                }
            }
        }
        MeeshyCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                ShareLinkSectionTitle(stringResource(R.string.shareLink_detail_recentArrivals))
                if (stats.recentArrivals.isEmpty()) {
                    Text(
                        stringResource(R.string.shareLink_detail_noArrivals),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                } else {
                    stats.recentArrivals.take(ShareLinkArrivalsSection.RECENT_LIMIT).forEach { ShareLinkArrivalRow(it) }
                }
                if (ShareLinkArrivalsSection.showsSeeAll(stats)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clickable(role = Role.Button) { onSeeAll(stats.arrivals) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    ) {
                        Text(
                            pluralStringResource(R.plurals.shareLink_arrivals_seeAll, stats.arrivals, stats.arrivals),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = MeeshyPalette.Indigo400,
                            modifier = Modifier.weight(1f),
                        )
                        Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyPalette.Indigo400)
                    }
                }
            }
        }
    }
}

@Composable
private fun Tile(value: Int?, label: String, loading: Boolean, modifier: Modifier) {
    MeeshyCard(modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            if (loading) {
                MeeshySkeletonBox(Modifier.padding(vertical = 4.dp).heightIn(min = 24.dp).fillMaxWidth(0.6f))
            } else {
                Text(
                    text = value?.let { NumberFormat.getIntegerInstance().format(it) } ?: "—",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                )
            }
            Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textSecondary, maxLines = 2)
        }
    }
}
