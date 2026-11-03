package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameRarityTest {

    @Test
    fun `la rarete rejoue les vecteurs partages`() {
        GameLawVectors.cases("rarity").forEach {
            val holders = it.int("holders")
            val population = it.int("population")
            assertWithMessage(it.label).that(GameRarity.rarity(holders, population).name.lowercase()).isEqualTo(it.expected["rarity"].text())
            val measured = GameRarity.measure(holders, population)
            val expectedMeasured = it.expected["measured"]
            if (expectedMeasured == null || expectedMeasured is JsonNull) {
                assertWithMessage(it.label).that(measured).isNull()
                assertWithMessage(it.label).that(it.expected["border"]).isEqualTo(JsonNull)
            } else {
                assertWithMessage(it.label).that(measured!!.name.lowercase()).isEqualTo(expectedMeasured.text())
                assertWithMessage(it.label).that(GameRarity.border(measured).name.lowercase()).isEqualTo(it.expected["border"].text())
            }
            assertWithMessage(it.label).that(GameRarity.gloryAtEarning(measured)).isEqualTo(it.expected["glory"]!!.jsonPrimitive.intOrNull)
        }
    }

    @Test
    fun `l'affichage de la rarete rejoue les vecteurs partages`() {
        GameLawVectors.cases("rarity-display").forEach {
            assertWithMessage(it.label).that(GameRarity.isShareDisplayable(it.int("holders"), it.int("population")))
                .isEqualTo(it.expected["displayable"].boolValue())
        }
    }

    @Test
    fun `cinq raretes ont cinq lisere distincts`() {
        val borders = GloryLaws.AchievementRarity.entries.map(GameRarity::border)
        assertThat(borders).containsExactly(RarityBorder.Slate, RarityBorder.Blue, RarityBorder.Violet, RarityBorder.Gold, RarityBorder.Prism).inOrder()
    }

    @Test
    fun `sans mesure la ligne reste fail-closed et rapporte la Gloire du commun`() {
        assertThat(GameRarity.measure(1, 999)).isNull()
        assertThat(GameRarity.gloryAtEarning(null)).isEqualTo(GloryLaws.gloryForAchievement(GloryLaws.AchievementRarity.Common))
        assertThat(GameRarity.isShareDisplayable(19, 50_000)).isFalse()
        assertThat(GameRarity.isShareDisplayable(20, 999)).isFalse()
        assertThat(GameRarity.MIN_POPULATION).isEqualTo(1000)
        assertThat(GameRarity.MIN_DISPLAY_HOLDERS).isEqualTo(20)
    }
}
