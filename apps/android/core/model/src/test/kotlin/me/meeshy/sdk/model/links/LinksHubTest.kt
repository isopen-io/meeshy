package me.meeshy.sdk.model.links

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AffiliateStats
import me.meeshy.sdk.model.CommunityLinkStats
import me.meeshy.sdk.model.LinkStatsCard
import me.meeshy.sdk.model.LinkStatsSnapshot
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.TrackingLinkStats
import org.junit.Test

class LinksHubTest {

    private fun full() = LinkStatsSnapshot(
        tracking = LinkStatsCard.Loaded(TrackingLinkStats(totalLinks = 3, totalClicks = 40, uniqueClicks = 25, activeLinks = 2)),
        affiliate = LinkStatsCard.Loaded(AffiliateStats(totalTokens = 2, totalReferrals = 7)),
        share = LinkStatsCard.Loaded(MyShareLinkStats(totalLinks = 5, activeLinks = 4, totalUses = 12)),
        community = LinkStatsCard.Loaded(CommunityLinkStats(totalCommunities = 1, totalMembers = 9, activeCommunities = 1)),
    )

    @Test
    fun `chaque carte annonce le nombre de liens et ce qu'ils ont produit`() {
        val snapshot = full()
        assertThat(LinksHubSummary.figures(LinksHubEntry.SHARE, snapshot)).isEqualTo(LinksHubFigures(5, 12))
        assertThat(LinksHubSummary.figures(LinksHubEntry.TRACKING, snapshot)).isEqualTo(LinksHubFigures(3, 40))
        assertThat(LinksHubSummary.figures(LinksHubEntry.COMMUNITY, snapshot)).isEqualTo(LinksHubFigures(1, 9))
        assertThat(LinksHubSummary.figures(LinksHubEntry.AFFILIATE, snapshot)).isEqualTo(LinksHubFigures(2, 7))
    }

    @Test
    fun `une source indisponible n'affiche aucun chiffre plutot qu'un zero`() {
        val snapshot = full().copy(tracking = LinkStatsCard.Unavailable)
        assertThat(LinksHubSummary.figures(LinksHubEntry.TRACKING, snapshot)).isNull()
        assertThat(LinksHubSummary.figures(LinksHubEntry.SHARE, snapshot)).isNotNull()
    }

    @Test
    fun `des chiffres de parrainage tous absents ne fabriquent pas de zero`() {
        val snapshot = full().copy(affiliate = LinkStatsCard.Loaded(AffiliateStats()))
        assertThat(LinksHubSummary.figures(LinksHubEntry.AFFILIATE, snapshot)).isNull()
    }

    @Test
    fun `le tableau vide est reconnu`() {
        assertThat(LinksHubSummary.isEmpty(LinkStatsSnapshot())).isTrue()
        assertThat(LinksHubSummary.isEmpty(full())).isFalse()
    }

    @Test
    fun `un echec de rafraichissement garde l'ancien chiffre de la carte`() {
        val merged = LinksHubSummary.merge(previous = full(), fresh = LinkStatsSnapshot(share = LinkStatsCard.Loaded(MyShareLinkStats(totalLinks = 6, totalUses = 20))))
        assertThat(LinksHubSummary.figures(LinksHubEntry.SHARE, merged)).isEqualTo(LinksHubFigures(6, 20))
        assertThat(LinksHubSummary.figures(LinksHubEntry.TRACKING, merged)).isEqualTo(LinksHubFigures(3, 40))
    }

    @Test
    fun `seule la carte communaute n'a pas de bouton creer`() {
        assertThat(LinksHubEntry.entries.filter { !it.canCreate }).containsExactly(LinksHubEntry.COMMUNITY)
        assertThat(LinksHubEntry.entries.map { it.name }).containsExactly("SHARE", "TRACKING", "COMMUNITY", "AFFILIATE").inOrder()
    }
}
