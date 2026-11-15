package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameRefusalTest {

    @Test
    fun `le code d'un refus 409 se lit depuis le champ code`() {
        val refusal = GameRefusal.parse("""{"success":false,"error":"Pas assez","code":"INSUFFICIENT_POINTS"}""")!!

        assertThat(refusal.code).isEqualTo(GameErrorCode.InsufficientPoints)
        assertThat(refusal.sparksDebt).isNull()
        assertThat(refusal.priceChanged).isNull()
    }

    @Test
    fun `MINT_BLOCKED_BY_DEBT expose sparksDebt a la racine`() {
        val refusal = GameRefusal.parse("""{"success":false,"code":"MINT_BLOCKED_BY_DEBT","sparksDebt":1250}""")!!

        assertThat(refusal.code).isEqualTo(GameErrorCode.MintBlockedByDebt)
        assertThat(refusal.sparksDebt).isEqualTo(1250)
    }

    @Test
    fun `PRICE_CHANGED expose le prix courant a la racine`() {
        val body = """{"success":false,"code":"PRICE_CHANGED","number":14,"price":1700,"basePrice":1587,"costFactor":0.93}"""

        val price = GameRefusal.parse(body)!!.priceChanged!!

        assertThat(price).isEqualTo(GameRefusal.PriceChanged(number = 14, price = 1700, basePrice = 1587, costFactor = 0.93))
    }

    @Test
    fun `PRICE_CHANGED incomplet ne leve pas et ne devine pas un prix`() {
        val refusal = GameRefusal.parse("""{"code":"PRICE_CHANGED","number":14}""")!!

        assertThat(refusal.code).isEqualTo(GameErrorCode.PriceChanged)
        assertThat(refusal.priceChanged).isNull()
    }

    @Test
    fun `TREASURY_LOCKED expose la reserve et le rang requis`() {
        val body = """{"code":"TREASURY_LOCKED","tier":"tresor","minHeld":500,
            "requires":{"rank":"voix","division":1,"division5":1}}"""

        val lock = GameRefusal.parse(body)!!.treasuryLocked!!

        assertThat(lock.tier).isEqualTo(TreasuryTierKey.Tresor)
        assertThat(lock.requires.rank).isEqualTo(GloryRank.Voix)
    }

    @Test
    fun `un code inconnu rend un code null et garde le brut`() {
        val refusal = GameRefusal.parse("""{"code":"BRAND_NEW","sparksDebt":3}""")!!

        assertThat(refusal.code).isNull()
        assertThat(refusal.rawCode).isEqualTo("BRAND_NEW")
        assertThat(refusal.sparksDebt).isEqualTo(3)
    }

    @Test
    fun `un corps absent illisible ou non objet rend null`() {
        assertThat(GameRefusal.parse(null as String?)).isNull()
        assertThat(GameRefusal.parse("")).isNull()
        assertThat(GameRefusal.parse("<html>")).isNull()
        assertThat(GameRefusal.parse("[1]")).isNull()
    }

    @Test
    fun `un corps sans code rend un refus sans code`() {
        val refusal = GameRefusal.parse("""{"success":false,"error":"x"}""")!!

        assertThat(refusal.code).isNull()
        assertThat(refusal.rawCode).isNull()
    }
}
