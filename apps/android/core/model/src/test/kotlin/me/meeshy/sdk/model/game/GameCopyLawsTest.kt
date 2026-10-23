package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameCopyLawsTest {

    @Test
    fun `chaque palier chaque rang chaque matiere et chaque contenant a son nom`() {
        val names = LevelTierKey.entries.map { GameCopyLaws.tierName(it).key } +
            LevelTierKey.entries.map { GameCopyLaws.tierOrdinal(it).key } +
            GloryRank.entries.map { GameCopyLaws.rankName(it).key } +
            GameMaterial.entries.map { GameCopyLaws.materialName(it).key } +
            TreasuryTierKey.entries.map { GameCopyLaws.treasuryName(it).key } +
            FlameFormKey.entries.map { GameCopyLaws.flameFormName(it).key } +
            MeeshEdition.entries.map { GameCopyLaws.editionName(it).key } +
            MissionDifficulty.entries.map { GameCopyLaws.difficultyName(it).key }
        assertThat(names).containsNoDuplicates()
        assertThat(names).hasSize(20 + 20 + 11 + 8 + 6 + 5 + 3 + 4)
    }

    @Test
    fun `les ordinaux suivent l ordre des paliers`() {
        assertThat(GameCopyLaws.tierOrdinal(LevelTierKey.Etincelle).key).isEqualTo(GameTextKey.TierOrdinal1)
        assertThat(GameCopyLaws.tierOrdinal(LevelTierKey.Eclat).key).isEqualTo(GameTextKey.TierOrdinal4)
        assertThat(GameCopyLaws.tierOrdinal(LevelTierKey.Singularite).key).isEqualTo(GameTextKey.TierOrdinal20)
    }

    @Test
    fun `les compteurs portent l entier et non un texte formate`() {
        assertThat(GameCopyLaws.points(1_221).args).containsExactly(GameTextArg.Count(1_221))
        assertThat(GameCopyLaws.days(3).key).isEqualTo(GameTextKey.Days)
        assertThat(GameCopyLaws.meeshes(0).key).isEqualTo(GameTextKey.MeeshesNone)
        assertThat(GameCopyLaws.meeshes(-2).key).isEqualTo(GameTextKey.MeeshesNone)
        assertThat(GameCopyLaws.meeshes(2).args).containsExactly(GameTextArg.Count(2))
    }

    @Test
    fun `le contenant tenu et le contenant a ouvrir se disent par tier`() {
        assertThat(GameCopyLaws.treasuryHeld(null).key).isEqualTo(GameTextKey.FicheHeritageHeldNone)
        assertThat(GameCopyLaws.treasuryHeld(TreasuryTierKey.Coffret).key).isEqualTo(GameTextKey.FicheHeritageHeldCoffret)
        val opens = GameCopyLaws.treasuryOpens(TreasuryTierKey.Coffre, 100)
        assertThat(opens.key).isEqualTo(GameTextKey.FicheHeritageOpensCoffre)
        assertThat(opens.args).containsExactly(GameTextArg.Count(100))
    }

    @Test
    fun `une duree calme ne montre jamais de secondes`() {
        assertThat(GameCopyLaws.calmDuration(5.0)).isEqualTo(
            GameText.of(GameTextKey.DurationMinutes, GameTextArg.Count(1)),
        )
        assertThat(GameCopyLaws.calmDuration(61.0)).isEqualTo(
            GameText.of(GameTextKey.DurationMinutes, GameTextArg.Count(2)),
        )
        assertThat(GameCopyLaws.calmDuration(3_600.0)).isEqualTo(
            GameText.of(GameTextKey.DurationHours, GameTextArg.Count(1)),
        )
    }

    @Test
    fun `heures et minutes se joignent et les jours gardent les heures`() {
        val hoursMinutes = GameCopyLaws.calmDuration(83 * 60.0)
        assertThat(hoursMinutes.key).isEqualTo(GameTextKey.JoinedBySpace)
        assertThat(hoursMinutes.args).containsExactly(
            GameTextArg.Nested(GameText.of(GameTextKey.DurationHours, GameTextArg.Count(1))),
            GameTextArg.Nested(GameText.of(GameTextKey.DurationMinutes, GameTextArg.Count(23))),
        ).inOrder()
        assertThat(GameCopyLaws.calmDuration((26 * 60 + 5) * 60.0)).isEqualTo(
            GameText.of(GameTextKey.DurationDaysHours, GameTextArg.Count(1), GameTextArg.Count(2)),
        )
    }

    @Test
    fun `le minuteur d une mission habille la duree calme`() {
        val remaining = GameCopyLaws.missionRemaining(600.0)
        assertThat(remaining.key).isEqualTo(GameTextKey.MissionTimerRemaining)
        assertThat(remaining.args.single()).isEqualTo(GameTextArg.Nested(GameCopyLaws.calmDuration(600.0)))
        assertThat(GameCopyLaws.missionEnding(finished = true).key).isEqualTo(GameTextKey.MissionFinished)
        assertThat(GameCopyLaws.missionEnding(finished = false).key).isEqualTo(GameTextKey.MissionMissed)
    }
}
