package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GameRarityEntry
import org.junit.Test

class RevealRimTest {

    private val legacy = EngagementReveal.Achievement(EngagementAchievementKey.FIRST_CONTENT)
    private val composed = EngagementReveal.ComposedAchievement(AchievementCatalog.families.first { it.id == "message.send.count" }, 1000)
    private val epic = GameRarityEntry(AchievementRarity.Epic, holders = 4000, population = 100_000)

    @Test
    fun `la rarete se mesure sous la cle que la passerelle grave, sans le prefixe de l'identite`() {
        assertThat(legacy.achievementRarityKey).isEqualTo("achievement.first_content")
        assertThat(composed.achievementRarityKey).isEqualTo(composed.family.key(1000))
        assertThat(composed.id).isEqualTo("achievement:${composed.achievementRarityKey}")
    }

    @Test
    fun `un badge, une serie, un niveau n'ont aucune rarete`() {
        listOf(EngagementReveal.Badge("content.text_message", 100), EngagementReveal.Streak(7), EngagementReveal.Level(3)).forEach {
            assertThat(it.achievementRarityKey).isNull()
        }
    }

    @Test
    fun `l'entree est celle du bloc servi, rien sans bloc ni sous Jeu masque`() {
        val rarities = mapOf("achievement.first_content" to epic)

        assertThat(RevealRim.entry(legacy, rarities, hidden = false)).isEqualTo(epic)
        assertThat(RevealRim.entry(legacy, rarities, hidden = true)).isNull()
        assertThat(RevealRim.entry(legacy, null, hidden = false)).isNull()
        assertThat(RevealRim.entry(composed, rarities, hidden = false)).isNull()
        assertThat(RevealRim.entry(EngagementReveal.Streak(7), rarities, hidden = false)).isNull()
    }

    @Test
    fun `le lisere suit la rarete et reste FAIL-CLOSED sous les seuils de mesure`() {
        assertThat(RevealRim.border(epic)).isEqualTo(RarityBorder.Violet)
        assertThat(RevealRim.border(epic.copy(holders = 19))).isNull()
        assertThat(RevealRim.border(epic.copy(population = 999))).isNull()
        assertThat(RevealRim.border(null)).isNull()
        assertThat(AchievementRarity.values().map { RarityBorder.of(it) })
            .containsExactly(RarityBorder.Slate, RarityBorder.Blue, RarityBorder.Violet, RarityBorder.Gold, RarityBorder.Prism).inOrder()
    }

    @Test
    fun `la ligne de rarete dit le nom et la part, ou la mesure en cours, ou rien`() {
        assertThat(RevealRim.line(epic)).isEqualTo(RevealRim.Line.Measured(AchievementRarity.Epic, 4.0))
        assertThat(RevealRim.line(epic.copy(holders = 3))).isEqualTo(RevealRim.Line.Measuring)
        assertThat(RevealRim.line(null)).isNull()
    }

    @Test
    fun `la part des comptes s'ecrit en entiers des 1 pour cent, a une decimale dessous, jamais sous un dixieme`() {
        assertThat(RevealRim.percentDigits(40.0)).isEqualTo(0 to 40.0)
        assertThat(RevealRim.percentDigits(4.2)).isEqualTo(0 to 4.0)
        assertThat(RevealRim.percentDigits(0.6)).isEqualTo(1 to 0.6)
        assertThat(RevealRim.percentDigits(0.01)).isEqualTo(1 to 0.1)
        assertThat(RevealRim.isBelowTenth(0.01)).isTrue()
        assertThat(RevealRim.isBelowTenth(0.1)).isFalse()
    }
}
