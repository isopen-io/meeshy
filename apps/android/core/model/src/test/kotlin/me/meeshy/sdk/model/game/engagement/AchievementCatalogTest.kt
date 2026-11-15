package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import kotlin.math.log10
import org.junit.Test

class AchievementCatalogTest {

    private fun family(id: String) = AchievementCatalog.families.first { it.id == id }

    @Test
    fun `decouverte et community leave count sont exclues du catalogue`() {
        assertThat(AchievementCatalog.families.map { it.section }).doesNotContain("decouverte")
        assertThat(AchievementCatalog.families.map { it.id }).doesNotContain("community.leave.count")
        assertThat(AchievementCatalog.families).hasSize(22)
    }

    @Test
    fun `une famille non mesuree masque ses paliers d ampleur et garde ceux de volume`() {
        assertThat(AchievementCatalog.isAttainable(family("conversation.join.size"), 10, emptyMap())).isFalse()
        assertThat(AchievementCatalog.isAttainable(family("message.send.count"), 10_000, emptyMap())).isTrue()
    }

    @Test
    fun `la carte d atteignabilite retire les paliers au dela de la mesure`() {
        val reach = mapOf("conversation.join.size" to 150)
        val tiers = AchievementResolver.sections(reach, emptyMap(), listOf(family("conversation.join.size")))
            .flatMap { it.entries }.filter { it.family.id == "conversation.join.size" }.map { it.tier }

        assertThat(tiers).containsExactly(10, 100)
    }

    @Test
    fun `le tri suit baseDifficulty plus log10 du palier et depart par la cle`() {
        val entries = AchievementResolver.sections(emptyMap(), emptyMap()).flatMap { it.entries }
        val all = AchievementResolver.sections(emptyMap(), emptyMap())

        assertThat(all.all { s -> s.entries.zipWithNext().all { (a, b) -> a.difficulty < b.difficulty || (a.difficulty == b.difficulty && a.key < b.key) } }).isTrue()
        assertThat(entries).isNotEmpty()
        assertThat(family("message.send.count").difficulty(100)).isWithin(1e-9).of(0.0 + log10(100.0))
        assertThat(family("conversation.join.size").difficulty(1_000)).isWithin(1e-9).of(1.0 + log10(1_000.0))
    }

    @Test
    fun `la fenetre garde sept entrees puis deux de plus par succes acquis`() {
        assertThat(AchievementCatalog.windowSize(0)).isEqualTo(7)
        assertThat(AchievementCatalog.windowSize(5)).isEqualTo(7)
        assertThat(AchievementCatalog.windowSize(6)).isEqualTo(8)
        assertThat(AchievementCatalog.windowSize(-3)).isEqualTo(7)
        val cercles = AchievementResolver.sections(mapOf("conversation.join.size" to 1_000_000), emptyMap()).first { it.section == "cercles" }
        assertThat(cercles.entries).hasSize(7)
        assertThat(cercles.attainableCount).isGreaterThan(7)
    }

    @Test
    fun `une cle hors famille ou hors echelle ne se lit pas`() {
        assertThat(AchievementCatalog.parse("achievement.parole.message.send.count:100")?.tier).isEqualTo(100)
        assertThat(AchievementCatalog.parse("achievement.parole.message.send.count:42")).isNull()
        assertThat(AchievementCatalog.parse("achievement.decouverte.x.y.count:1")).isNull()
    }
}
