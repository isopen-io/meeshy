package me.meeshy.app.conversations.links

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** Ce qui permet de reconnaître un lien de suivi dans la liste : sa création ET son dernier clic, s'il y en a eu un. */
internal data class TrackingRowFacts(val createdMillis: Long?, val lastClickMillis: Long?)

internal fun trackingRowFacts(link: TrackingLink): TrackingRowFacts = TrackingRowFacts(
    createdMillis = isoToEpochMillisOrNull(link.createdAt)?.takeIf { it > 0 },
    lastClickMillis = isoToEpochMillisOrNull(link.lastClickedAt)?.takeIf { it > 0 },
)

/** Ce qui permet de reconnaître un lien de parrainage : sa création, et « utilisés sur plafond » quand il en a un. */
internal data class AffiliateRowFacts(val createdMillis: Long?, val used: Int?, val max: Int?)

internal fun affiliateRowFacts(token: AffiliateToken): AffiliateRowFacts = AffiliateRowFacts(
    createdMillis = isoToEpochMillisOrNull(token.createdAt)?.takeIf { it > 0 },
    used = token.maxUses?.takeIf { it > 0 }?.let { token.currentUses },
    max = token.maxUses?.takeIf { it > 0 },
)

/** Ce qui permet de reconnaître un lien de communauté : sa création. */
internal fun communityRowCreatedMillis(link: CommunityLink): Long? = isoToEpochMillisOrNull(link.createdAt)?.takeIf { it > 0 }

@Composable
internal fun communityRowCreatedText(link: CommunityLink): String? =
    communityRowCreatedMillis(link)?.let { stringResource(R.string.links_common_created, ShareLinkDateFormat.day(it)) }

@Composable
internal fun trackingRowFactsText(link: TrackingLink): String? {
    val facts = trackingRowFacts(link)
    val created = facts.createdMillis?.let { stringResource(R.string.links_common_created, ShareLinkDateFormat.day(it)) }
    val lastClick = facts.lastClickMillis?.let { stringResource(R.string.links_tracking_detail_last_click, ShareLinkDateFormat.dayAndTime(it)) }
    return listOfNotNull(created, lastClick).takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

@Composable
internal fun affiliateRowFactsText(token: AffiliateToken): String? {
    val facts = affiliateRowFacts(token)
    val created = facts.createdMillis?.let { stringResource(R.string.links_common_created, ShareLinkDateFormat.day(it)) }
    val uses = if (facts.used != null && facts.max != null) stringResource(R.string.links_affiliate_row_uses, facts.used, facts.max) else null
    return listOfNotNull(created, uses).takeIf { it.isNotEmpty() }?.joinToString(" · ")
}
