package me.meeshy.sdk.model.links

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AffiliateCount
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkClick
import org.junit.Test

class LinkFormsTest {

    private fun token(id: String, clicks: Int = 0, referrals: Int = 0) =
        AffiliateToken(id = id, token = "t$id", name = "n$id", clickCount = clicks, _count = AffiliateCount(referrals))

    @Test
    fun `un nom vide ne peut pas etre envoye`() {
        assertThat(AffiliateCreateForm(name = "   ").isSubmittable).isFalse()
        assertThat(AffiliateCreateForm(name = "   ").request()).isNull()
    }

    @Test
    fun `le nom est rogne et le plafond absent veut dire illimite`() {
        val request = AffiliateCreateForm(name = "  Invitation Twitter ").request()
        assertThat(request?.name).isEqualTo("Invitation Twitter")
        assertThat(request?.maxUses).isNull()
    }

    @Test
    fun `le plafond ne garde que des chiffres et zero est illimite`() {
        assertThat(AffiliateCreateForm(name = "x").withMaxUses("1a2b").request()?.maxUses).isEqualTo(12)
        assertThat(AffiliateCreateForm(name = "x").withMaxUses("0").request()?.maxUses).isNull()
    }

    @Test
    fun `les totaux de parrainage somment les jetons`() {
        val state = AffiliateTokensState(listOf(token("1", clicks = 3, referrals = 1), token("2", clicks = 4, referrals = 2)))
        assertThat(state.linkCount).isEqualTo(2)
        assertThat(state.clickCount).isEqualTo(7)
        assertThat(state.signupCount).isEqualTo(3)
    }

    @Test
    fun `un jeton cree passe en tete sans doublon et un jeton retire disparait`() {
        val state = AffiliateTokensState(listOf(token("1"), token("2")))
        assertThat(state.prepended(token("3")).tokens.map { it.id }).containsExactly("3", "1", "2").inOrder()
        assertThat(state.prepended(token("2")).tokens.map { it.id }).containsExactly("2", "1").inOrder()
        assertThat(state.removed("1").tokens.map { it.id }).containsExactly("2")
    }

    @Test
    fun `une url sans schema recoit https et une url sans hote est refusee`() {
        assertThat(CreateTrackingLinkForm(destinationUrl = "meeshy.me/promo").normalizedUrl).isEqualTo("https://meeshy.me/promo")
        assertThat(CreateTrackingLinkForm(destinationUrl = "meeshy.me").isValid).isTrue()
        assertThat(CreateTrackingLinkForm(destinationUrl = "https://").isValid).isFalse()
        assertThat(CreateTrackingLinkForm(destinationUrl = "").isValid).isFalse()
        assertThat(CreateTrackingLinkForm(destinationUrl = "a b").isValid).isFalse()
    }

    @Test
    fun `les champs vides ne partent pas dans la requete`() {
        val request = CreateTrackingLinkForm(destinationUrl = " https://a.io ", name = "", campaign = " summer ", customToken = "  ").request()
        assertThat(request?.originalUrl).isEqualTo("https://a.io")
        assertThat(request?.name).isNull()
        assertThat(request?.campaign).isEqualTo("summer")
        assertThat(request?.token).isNull()
    }

    @Test
    fun `le nom d'un lien de suivi retombe sur son jeton`() {
        assertThat(TrackingLink(id = "1", token = "abc", name = "Insta").displayName).isEqualTo("Insta")
        assertThat(TrackingLink(id = "1", token = "abc", name = "  ").displayName).isEqualTo("abc")
    }

    @Test
    fun `la liste de suivi insere et retire par jeton`() {
        val state = TrackingLinksState(listOf(TrackingLink(id = "1", token = "a")))
        assertThat(state.prepended(TrackingLink(id = "2", token = "b")).links.map { it.token }).containsExactly("b", "a").inOrder()
        assertThat(state.removed("a").links).isEmpty()
    }

    @Test
    fun `les repartitions classent par nombre decroissant puis nom et bornent a cinq`() {
        val clicks = listOf("FR", "FR", "FR", "US", "US", "DE", "BE", "ES", "IT", "PT").mapIndexed { i, c ->
            TrackingLinkClick(id = "$i", country = c)
        } + TrackingLinkClick(id = "x", country = null)
        val breakdown = ClicksBreakdown.of(clicks, totalClicks = 10)
        assertThat(breakdown.countries.map { it.label }).containsExactly("FR", "US", "BE", "DE", "ES").inOrder()
        assertThat(breakdown.countries.first().fraction).isWithin(0.0001f).of(0.3f)
        assertThat(breakdown.devices).isEmpty()
    }

    @Test
    fun `la part est nulle quand le total est inconnu`() {
        val rows = ClicksBreakdown.of(listOf(TrackingLinkClick(id = "1", device = "mobile")), totalClicks = 0).devices
        assertThat(rows.single().fraction).isEqualTo(0f)
    }

    @Test
    fun `le drapeau suit le code pays et refuse le reste`() {
        assertThat(countryFlag("fr")).isEqualTo("🇫🇷")
        assertThat(countryFlag("France")).isEmpty()
        assertThat(countryFlag("1A")).isEmpty()
    }

    @Test
    fun `l'appareil d'un clic se range en quatre genres`() {
        assertThat(ClickDeviceKind.of("Phone")).isEqualTo(ClickDeviceKind.MOBILE)
        assertThat(ClickDeviceKind.of("tablet")).isEqualTo(ClickDeviceKind.TABLET)
        assertThat(ClickDeviceKind.of("DESKTOP")).isEqualTo(ClickDeviceKind.DESKTOP)
        assertThat(ClickDeviceKind.of(null)).isEqualTo(ClickDeviceKind.OTHER)
    }

    @Test
    fun `une communaute devient un lien chat canonique avec ses totaux`() {
        val links = listOf(
            CommunityMini(id = "1", name = "A", identifier = "alpha", isActive = true, memberCount = 4).toCommunityLink("https://meeshy.me/"),
            CommunityMini(id = "2", name = "B", identifier = "beta", isActive = false).toCommunityLink("https://meeshy.me"),
        )
        assertThat(links[0].joinUrl).isEqualTo("https://meeshy.me/chat/alpha")
        assertThat(links[1].memberCount).isEqualTo(0)
        val stats = links.toStats()
        assertThat(stats.totalCommunities).isEqualTo(2)
        assertThat(stats.totalMembers).isEqualTo(4)
        assertThat(stats.activeCommunities).isEqualTo(1)
    }

    @Test
    fun `un jeton restaure revient a sa place sans doublon`() {
        val state = AffiliateTokensState(listOf(token("1"), token("3")))

        assertThat(state.restored(token("2"), 1).tokens.map { it.id }).containsExactly("1", "2", "3").inOrder()
        assertThat(state.restored(token("2"), 9).tokens.map { it.id }).containsExactly("1", "3", "2").inOrder()
        assertThat(state.restored(token("1"), 0)).isEqualTo(state)
    }
}
