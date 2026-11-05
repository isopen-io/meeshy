package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import me.meeshy.sdk.model.AffiliateToken
import org.junit.Test

class ReferralLinkRuleTest {

    private val now = Instant.parse("2026-11-01T12:00:00Z").toEpochMilli()

    private fun token(
        id: String = "t1",
        link: String? = "https://meeshy.me/signup/affiliate/AMANI7",
        active: Boolean = true,
        maxUses: Int? = null,
        uses: Int = 0,
        expiresAt: String? = null,
    ) = AffiliateToken(
        id = id, token = id, name = "n", affiliateLink = link,
        maxUses = maxUses, currentUses = uses, isActive = active, expiresAt = expiresAt,
    )

    @Test
    fun `un jeton actif avec un lien sert`() {
        assertThat(ReferralLinkRule.link(listOf(token()), now)).isEqualTo("https://meeshy.me/signup/affiliate/AMANI7")
    }

    @Test
    fun `un jeton inactif ne part jamais`() {
        assertThat(ReferralLinkRule.link(listOf(token(active = false)), now)).isNull()
    }

    @Test
    fun `expire strictement apres l'echeance - a l'instant exact il sert encore`() {
        assertThat(ReferralLinkRule.isExpired("2026-11-01T12:00:00Z", now)).isFalse()
        assertThat(ReferralLinkRule.isExpired("2026-11-01T11:59:59.999Z", now)).isTrue()
        assertThat(ReferralLinkRule.link(listOf(token(expiresAt = "2026-11-01T12:00:00.000Z")), now)).isNotNull()
        assertThat(ReferralLinkRule.link(listOf(token(expiresAt = "2026-11-01T11:59:59Z")), now)).isNull()
    }

    @Test
    fun `une date illisible vaut expire, jamais sans echeance`() {
        assertThat(ReferralLinkRule.isExpired("demain", now)).isTrue()
        assertThat(ReferralLinkRule.isExpired(null, now)).isFalse()
    }

    @Test
    fun `epuise quand les usages atteignent le plafond, illimite quand maxUses est nul ou nul`() {
        assertThat(ReferralLinkRule.isExhausted(5, 5)).isTrue()
        assertThat(ReferralLinkRule.isExhausted(5, 4)).isFalse()
        assertThat(ReferralLinkRule.isExhausted(null, 999)).isFalse()
        assertThat(ReferralLinkRule.isExhausted(0, 999)).isFalse()
        assertThat(ReferralLinkRule.link(listOf(token(maxUses = 3, uses = 3)), now)).isNull()
    }

    @Test
    fun `un jeton sans lien ou au lien vide ne part pas`() {
        assertThat(ReferralLinkRule.link(listOf(token(link = null), token(link = "")), now)).isNull()
    }

    @Test
    fun `le premier jeton utilisable gagne, les inutilisables sont sautes`() {
        val tokens = listOf(
            token(id = "a", active = false, link = "https://x/a"),
            token(id = "b", maxUses = 1, uses = 1, link = "https://x/b"),
            token(id = "c", link = "https://x/c"),
            token(id = "d", link = "https://x/d"),
        )
        assertThat(ReferralLinkRule.link(tokens, now)).isEqualTo("https://x/c")
    }
}
