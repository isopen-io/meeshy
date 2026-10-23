package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameLevelsTest {

    @Test
    fun `le seuil du niveau N vaut cent fois N au carre`() {
        assertThat(GameLevels.threshold(1)).isEqualTo(100L)
        assertThat(GameLevels.threshold(10)).isEqualTo(10_000L)
        assertThat(GameLevels.threshold(100)).isEqualTo(1_000_000L)
        assertThat(GameLevels.threshold(1000)).isEqualTo(100_000_000L)
    }

    @Test
    fun `le niveau suit le score a la frontiere exacte du seuil`() {
        assertThat(GameLevels.levelForScore(0, null)).isEqualTo(1)
        assertThat(GameLevels.levelForScore(399, null)).isEqualTo(1)
        assertThat(GameLevels.levelForScore(400, null)).isEqualTo(2)
        assertThat(GameLevels.levelForScore(999_999, null)).isEqualTo(99)
        assertThat(GameLevels.levelForScore(1_000_000, null)).isEqualTo(100)
        assertThat(GameLevels.levelForScore(-5, null)).isEqualTo(1)
    }

    @Test
    fun `un score immense se lit sans erreur d'arrondi flottant`() {
        val level = 1_000_000
        assertThat(GameLevels.levelForScore(GameLevels.threshold(level), null)).isEqualTo(level)
        assertThat(GameLevels.levelForScore(GameLevels.threshold(level) - 1, null)).isEqualTo(level - 1)
    }

    @Test
    fun `le plafond du rang borne le niveau mais jamais sous le niveau un`() {
        assertThat(GameLevels.levelForScore(GameLevels.threshold(800), GameLevels.CAP_BASE)).isEqualTo(499)
        assertThat(GameLevels.levelForScore(GameLevels.threshold(1500), GameLevels.CAP_AMBASSADOR)).isEqualTo(1000)
        assertThat(GameLevels.levelForScore(GameLevels.threshold(1500), null)).isEqualTo(1500)
        assertThat(GameLevels.levelForScore(5_000, 0)).isEqualTo(1)
    }

    @Test
    fun `les plafonds par rang suivent la Gloire`() {
        assertThat(GloryLaws.levelCap(GloryRank.Murmure)).isEqualTo(499)
        assertThat(GloryLaws.levelCap(GloryRank.Polyglotte)).isEqualTo(499)
        assertThat(GloryLaws.levelCap(GloryRank.Ambassadeur)).isEqualTo(1000)
        assertThat(GloryLaws.levelCap(GloryRank.Orateur)).isEqualTo(1000)
        assertThat(GloryLaws.levelCap(GloryRank.Oracle)).isNull()
        assertThat(GloryLaws.levelCap(GloryRank.Legende)).isNull()
        assertThat(GloryLaws.levelCap(GloryRank.Mythe)).isNull()
    }

    @Test
    fun `progress au plafond du rang est pleine et sans suite`() {
        val p = GameLevels.progress(GameLevels.threshold(900), GameLevels.CAP_BASE)
        assertThat(p.level).isEqualTo(499)
        assertThat(p.isMax).isTrue()
        assertThat(p.held).isFalse()
        assertThat(p.nextThreshold).isNull()
        assertThat(p.pointsToNext).isEqualTo(0L)
        assertThat(p.progress).isEqualTo(1.0)
        assertThat(p.cap).isEqualTo(499)
    }

    @Test
    fun `progress mesure la barre du niveau courant`() {
        val p = GameLevels.progress(99, 499)
        assertThat(p.level).isEqualTo(1)
        assertThat(p.floorScore).isEqualTo(0L)
        assertThat(p.nextThreshold).isEqualTo(400L)
        assertThat(p.pointsToNext).isEqualTo(301L)
        assertThat(p.progress).isWithin(1e-9).of(0.2475)
        assertThat(p.tier).isEqualTo(LevelTierKey.Etincelle)
    }

    @Test
    fun `progress retenue par une etape attend au palier avec la barre pleine`() {
        val p = GameLevels.progress(GameLevels.threshold(40), 1000, gate = 9)
        assertThat(p.level).isEqualTo(9)
        assertThat(p.held).isTrue()
        assertThat(p.isMax).isFalse()
        assertThat(p.pointsToNext).isEqualTo(0L)
        assertThat(p.progress).isEqualTo(1.0)
    }

    @Test
    fun `les paliers de nom suivent les vingt tranches de niveaux`() {
        assertThat(GameLevels.tier(1)).isEqualTo(LevelTierKey.Etincelle)
        assertThat(GameLevels.tier(9)).isEqualTo(LevelTierKey.Etincelle)
        assertThat(GameLevels.tier(10)).isEqualTo(LevelTierKey.Lueur)
        assertThat(GameLevels.tier(100)).isEqualTo(LevelTierKey.Galaxie)
        assertThat(GameLevels.tier(101)).isEqualTo(LevelTierKey.Nebuleuse)
        assertThat(GameLevels.tier(199)).isEqualTo(LevelTierKey.Nebuleuse)
        assertThat(GameLevels.tier(200)).isEqualTo(LevelTierKey.Pulsar)
        assertThat(GameLevels.tier(999)).isEqualTo(LevelTierKey.Infini)
        assertThat(GameLevels.tier(1000)).isEqualTo(LevelTierKey.Singularite)
        assertThat(GameLevels.tier(50_000)).isEqualTo(LevelTierKey.Singularite)
    }

    @Test
    fun `le premier niveau de chaque palier est celui ou ce palier commence`() {
        LevelTierKey.entries.forEach { tier ->
            assertThat(GameLevels.tier(GameLevels.tierStart(tier))).isEqualTo(tier)
        }
        assertThat(GameLevels.tierStart(LevelTierKey.Etincelle)).isEqualTo(1)
        assertThat(GameLevels.tierStart(LevelTierKey.Nebuleuse)).isEqualTo(101)
        assertThat(GameLevels.tierStart(LevelTierKey.Pulsar)).isEqualTo(200)
    }

    @Test
    fun `l'ancienne loi borne le niveau a cent`() {
        val p = GameLevels.legacyProgress(GameLevels.threshold(700))
        assertThat(p.level).isEqualTo(100)
        assertThat(p.tier).isEqualTo(LevelTierKey.Galaxie)
        assertThat(GameLevels.legacyLevel(0)).isEqualTo(1)
        assertThat(GameLevels.legacyTier(500)).isEqualTo(LevelTierKey.Galaxie)
    }

    @Test
    fun `le record et les nouveaux niveaux ne comptent que les premiers passages`() {
        assertThat(GameLevels.record(34, 30)).isEqualTo(34)
        assertThat(GameLevels.record(32, 36)).isEqualTo(36)
        assertThat(GameLevels.newLevelsReached(34, 30)).isEqualTo(GameNewLevels(31, 34, 4))
        assertThat(GameLevels.newLevelsReached(32, 36)).isEqualTo(GameNewLevels(0, 0, 0))
        assertThat(GameLevels.newLevelsReached(3, null)).isEqualTo(GameNewLevels(2, 3, 2))
    }

    @Test
    fun `le Prestige s'offre des le niveau cent tant qu'il reste une etoile`() {
        assertThat(GameLevels.canPrestige(99, 0)).isFalse()
        assertThat(GameLevels.canPrestige(100, 0)).isTrue()
        assertThat(GameLevels.canPrestige(1000, 4)).isTrue()
        assertThat(GameLevels.canPrestige(1000, 5)).isFalse()
    }

    @Test
    fun `la lecture des deblocages ne passe pas la dizaine qui suit le record`() {
        assertThat(GameLevels.stepCeiling(null)).isEqualTo(9)
        assertThat(GameLevels.stepCeiling(9)).isEqualTo(9)
        assertThat(GameLevels.stepCeiling(10)).isEqualTo(19)
        assertThat(GameLevels.stepCeiling(99)).isEqualTo(99)
        assertThat(GameLevels.stepCeiling(100)).isNull()
        assertThat(GameLevels.levelForUnlocks(GameLevels.threshold(80), levelRecord = 25)).isEqualTo(29)
        assertThat(GameLevels.levelForUnlocks(GameLevels.threshold(80), levelRecord = 100)).isEqualTo(80)
    }
}
