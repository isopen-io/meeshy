package me.meeshy.sdk.model.links

import me.meeshy.sdk.model.LinkStatsCard
import me.meeshy.sdk.model.LinkStatsSnapshot

/**
 * Les quatre cartes du hub « Mes liens » (iOS `LinksHubView.linkCategoryCards`), dans l'ordre
 * d'iOS. [accentHex] est la teinte de la carte (MeeshyColors.*AccentHex) ; [canCreate] dit si la
 * carte porte le bouton « + » (communautés : non, une communauté se crée ailleurs).
 */
enum class LinksHubEntry(val accentHex: String, val canCreate: Boolean) {
    SHARE(accentHex = "818CF8", canCreate = true),
    TRACKING(accentHex = "4F46E5", canCreate = true),
    COMMUNITY(accentHex = "FBBF24", canCreate = false),
    AFFILIATE(accentHex = "34D399", canCreate = true),
}

/**
 * Les deux chiffres qu'une carte du hub annonce sous sa description : le nombre de liens (ou de
 * communautés) et ce qu'ils ont produit (utilisations, clics, membres, inscrits).
 */
data class LinksHubFigures(val count: Int, val engagement: Int)

/**
 * Projette le tableau des quatre sources ([LinkStatsSnapshot], chargées en parallèle) sur la carte
 * du hub. Une source indisponible rend `null` : la carte n'affiche AUCUN chiffre plutôt qu'un zéro
 * inventé (hors ligne, « inconnu » n'est pas « zéro »).
 */
object LinksHubSummary {
    fun figures(entry: LinksHubEntry, snapshot: LinkStatsSnapshot): LinksHubFigures? = when (entry) {
        LinksHubEntry.SHARE -> snapshot.share.valueOrNull?.let { LinksHubFigures(it.totalLinks, it.totalUses) }
        LinksHubEntry.TRACKING -> snapshot.tracking.valueOrNull?.let { LinksHubFigures(it.totalLinks, it.totalClicks) }
        LinksHubEntry.COMMUNITY -> snapshot.community.valueOrNull?.let { LinksHubFigures(it.totalCommunities, it.totalMembers) }
        LinksHubEntry.AFFILIATE -> snapshot.affiliate.valueOrNull?.takeIf { it.totalTokens != null || it.totalReferrals != null }
            ?.let { LinksHubFigures(it.totalTokens ?: 0, it.totalReferrals ?: 0) }
    }

    /** `true` tant qu'aucune des quatre cartes n'a de chiffre : le hub ne montre alors aucune ligne de chiffres. */
    fun isEmpty(snapshot: LinkStatsSnapshot): Boolean =
        LinksHubEntry.entries.all { figures(it, snapshot) == null }

    /** Les cartes sans chiffre servent de repli : l'ancienne valeur reste affichée si la nouvelle source échoue. */
    fun merge(previous: LinkStatsSnapshot, fresh: LinkStatsSnapshot): LinkStatsSnapshot = LinkStatsSnapshot(
        tracking = fresh.tracking.orElse(previous.tracking),
        affiliate = fresh.affiliate.orElse(previous.affiliate),
        share = fresh.share.orElse(previous.share),
        community = fresh.community.orElse(previous.community),
    )

    private fun <T> LinkStatsCard<T>.orElse(fallback: LinkStatsCard<T>): LinkStatsCard<T> =
        if (this is LinkStatsCard.Loaded) this else fallback
}
