package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.game.GameLawVectors.array
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.obj
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameConstellationTest {

    @Test
    fun `la constellation rejoue les vecteurs partages`() {
        GameLawVectors.cases("constellation").forEach {
            val c = GameConstellation.of(it.int("collected"))
            assertWithMessage(it.label).that(listOf(c.collected, c.stars, c.inStar, c.toNextStar))
                .isEqualTo(listOf("collected", "stars", "inStar", "toNextStar").map { k -> it.expected[k]!!.jsonPrimitive.intOrNull })
            assertWithMessage(it.label).that(c.cosmetics.map { x -> Triple(x.star, x.kind.wire, x.cosmeticKey) })
                .isEqualTo(it.expected["cosmetics"].array().map { x ->
                    Triple(x.obj()["star"]!!.jsonPrimitive.intOrNull!!, x.obj()["kind"].text(), x.obj()["cosmeticKey"].text())
                })
        }
    }

    @Test
    fun `les cles cosmetiques rejouent les vecteurs partages`() {
        GameLawVectors.cases("constellation-key").forEach {
            assertWithMessage(it.label).that(GameConstellation.isCosmeticKey(it.str("key"))).isEqualTo(it.expected["valid"].boolValue())
        }
    }

    @Test
    fun `une etoile s'allume tous les dix fragments avec une cle deterministe`() {
        assertThat(GameConstellation.of(9).stars).isEqualTo(0)
        assertThat(GameConstellation.of(10).stars).isEqualTo(1)
        assertThat(GameConstellation.of(34).toNextStar).isEqualTo(6)
        assertThat(GameConstellation.of(-5).collected).isEqualTo(0)
        assertThat(GameConstellation.starCosmetic(4)!!.cosmeticKey).isEqualTo("constellation.star-4.halo")
        assertThat(GameConstellation.starCosmetic(0)).isNull()
        assertThat(GameConstellation.ofStars(3).collected).isEqualTo(30)
    }

    @Test
    fun `une cle dont le genre ne concorde pas n'est pas cosmetique`() {
        assertThat(GameConstellation.isCosmeticKey("constellation.star-1.frame")).isFalse()
        assertThat(GameConstellation.isCosmeticKey("constellation.star-01.halo")).isFalse()
        assertThat(GameConstellation.isCosmeticKey("constellation.star-2.frame")).isTrue()
    }
}
