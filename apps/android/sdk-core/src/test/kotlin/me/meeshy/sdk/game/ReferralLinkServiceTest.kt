package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.game.ReferralLinkRule
import org.junit.Test

class ReferralLinkServiceTest {

    private val now = Instant.parse("2026-11-01T12:00:00Z").toEpochMilli()

    private fun token(id: String, link: String? = "https://meeshy.me/signup/affiliate/$id", active: Boolean = true) =
        AffiliateToken(id = id, token = id, name = "n", affiliateLink = link, isActive = active)

    private class FakeGateway(
        var cached: List<AffiliateToken> = emptyList(),
        var listed: List<AffiliateToken>? = emptyList(),
        var created: AffiliateToken? = null,
    ) : ReferralTokenGateway {
        var listCalls = 0
        val createdNames = mutableListOf<String>()
        var stored: List<AffiliateToken>? = null
        override fun cachedTokens() = cached
        override suspend fun listTokens(): List<AffiliateToken>? { listCalls += 1; return listed }
        override suspend fun createToken(name: String): AffiliateToken? { createdNames += name; return created }
        override fun store(tokens: List<AffiliateToken>) { stored = tokens }
    }

    private fun service(gateway: FakeGateway) = ReferralLinkService(gateway) { now }

    @Test
    fun `un jeton utilisable en cache donne le lien sans toucher au reseau`() = runTest {
        val gateway = FakeGateway(cached = listOf(token("a")))
        assertThat(service(gateway).existingLink()).isEqualTo("https://meeshy.me/signup/affiliate/a")
        assertThat(gateway.listCalls).isEqualTo(0)
    }

    @Test
    fun `cache inutilisable puis liste - le premier jeton utilisable sert et la liste est rangee`() = runTest {
        val gateway = FakeGateway(cached = listOf(token("old", active = false)), listed = listOf(token("b")))
        assertThat(service(gateway).existingLink()).isEqualTo("https://meeshy.me/signup/affiliate/b")
        assertThat(gateway.stored).containsExactly(token("b"))
    }

    @Test
    fun `existingLink ne cree jamais de jeton`() = runTest {
        val gateway = FakeGateway(listed = emptyList(), created = token("z"))
        assertThat(service(gateway).existingLink()).isNull()
        assertThat(gateway.createdNames).isEmpty()
    }

    @Test
    fun `shareableLink cree UN jeton Invitation Meeshy quand la liste lue n'en porte aucun`() = runTest {
        val gateway = FakeGateway(listed = listOf(token("x", active = false)), created = token("new"))
        assertThat(service(gateway).shareableLink()).isEqualTo("https://meeshy.me/signup/affiliate/new")
        assertThat(gateway.createdNames).containsExactly(ReferralLinkRule.TOKEN_NAME)
        assertThat(gateway.stored!!.map { it.id }).containsExactly("new", "x").inOrder()
    }

    @Test
    fun `shareableLink lit l'existant sans creer`() = runTest {
        val gateway = FakeGateway(listed = listOf(token("b")), created = token("new"))
        assertThat(service(gateway).shareableLink()).isEqualTo("https://meeshy.me/signup/affiliate/b")
        assertThat(gateway.createdNames).isEmpty()
    }

    @Test
    fun `une lecture en panne ne cree rien a l'aveugle`() = runTest {
        val gateway = FakeGateway(listed = null, created = token("new"))
        assertThat(service(gateway).shareableLink()).isNull()
        assertThat(gateway.createdNames).isEmpty()
    }

    @Test
    fun `un refus de creation ne rend aucun lien`() = runTest {
        val gateway = FakeGateway(listed = emptyList(), created = null)
        assertThat(service(gateway).shareableLink()).isNull()
        assertThat(gateway.stored).isEqualTo(emptyList<AffiliateToken>())
    }

    @Test
    fun `un jeton cree sans lien ne part jamais`() = runTest {
        val gateway = FakeGateway(listed = emptyList(), created = token("new", link = null))
        assertThat(service(gateway).shareableLink()).isNull()
    }
}
