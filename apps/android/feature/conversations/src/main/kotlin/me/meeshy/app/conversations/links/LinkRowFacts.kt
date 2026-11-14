package me.meeshy.app.conversations.links

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** Ce qui permet de reconnaître un lien de suivi dans la liste : son dernier clic, à défaut sa création. */
internal enum class TrackingRowDateKind { LAST_CLICK, CREATED }

internal data class TrackingRowDate(val kind: TrackingRowDateKind, val epochMillis: Long)

internal fun trackingRowDate(link: TrackingLink): TrackingRowDate? {
    isoToEpochMillisOrNull(link.lastClickedAt)?.takeIf { it > 0 }?.let { return TrackingRowDate(TrackingRowDateKind.LAST_CLICK, it) }
    return isoToEpochMillisOrNull(link.createdAt)?.takeIf { it > 0 }?.let { TrackingRowDate(TrackingRowDateKind.CREATED, it) }
}

/** Ce qui permet de reconnaître un lien de parrainage : sa création, et « utilisés sur plafond » quand il en a un. */
internal data class AffiliateRowFacts(val createdMillis: Long?, val used: Int?, val max: Int?)

internal fun affiliateRowFacts(token: AffiliateToken): AffiliateRowFacts = AffiliateRowFacts(
    createdMillis = isoToEpochMillisOrNull(token.createdAt)?.takeIf { it > 0 },
    used = token.maxUses?.takeIf { it > 0 }?.let { token.currentUses },
    max = token.maxUses?.takeIf { it > 0 },
)

@Composable
internal fun trackingRowDateText(link: TrackingLink): String? = trackingRowDate(link)?.let { date ->
    when (date.kind) {
        TrackingRowDateKind.LAST_CLICK -> stringResource(R.string.links_tracking_detail_last_click, ShareLinkDateFormat.dayAndTime(date.epochMillis))
        TrackingRowDateKind.CREATED -> stringResource(R.string.links_common_created, ShareLinkDateFormat.day(date.epochMillis))
    }
}

@Composable
internal fun affiliateRowFactsText(token: AffiliateToken): String? {
    val facts = affiliateRowFacts(token)
    val created = facts.createdMillis?.let { stringResource(R.string.links_common_created, ShareLinkDateFormat.day(it)) }
    val uses = if (facts.used != null && facts.max != null) stringResource(R.string.links_affiliate_row_uses, facts.used, facts.max) else null
    return listOfNotNull(created, uses).takeIf { it.isNotEmpty() }?.joinToString(" · ")
}
