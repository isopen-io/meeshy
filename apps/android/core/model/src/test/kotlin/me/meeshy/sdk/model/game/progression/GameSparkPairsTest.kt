package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameLevel
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import org.junit.Test

/** Les deux PAIRES des étincelles (iOS `GameSparkPairs`, #10846, #10860) : toujours montrées. */
class GameSparkPairsTest {

    private fun level(pocket: Long, cycle: Long, lifetime: Long): GameLevel {
        val block: GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))
        return block.level.copy(sparks = pocket, sparksCycle = cycle, sparksLifetime = lifetime)
    }

    @Test
    fun `sans renaissance le cumul dit recu depuis toujours`() {
        val pairs = GameSparkPairs.of(level(976, 12_000, 12_000))

        assertThat(pairs.pocket).isEqualTo(976L)
        assertThat(pairs.cumulLine).isEqualTo(GameText.of(GameTextKey.SparksRecordLine, GameTextArg.Count(12_000)))
    }

    @Test
    fun `apres une renaissance cet Age passe avant le tout`() {
        val pairs = GameSparkPairs.of(level(300, 4_200, 12_000))

        assertThat(pairs.cumulLine).isEqualTo(GameText.of(GameTextKey.SparksCumulRecord, GameTextArg.Count(4_200), GameTextArg.Count(12_000)))
    }

    @Test
    fun `la plus haute lumiere survit et les quatre faits sont toujours dits dans l ordre`() {
        val block = level(300, 4_200, 12_000)
        val pairs = GameSparkPairs.of(block)

        assertThat(pairs.levelMax).isEqualTo(block.shownLevelMaxLifetime)
        assertThat(pairs.levelRecordLine).isEqualTo(GameText.of(GameTextKey.SparksLevelRecordLine, GameTextArg.Count(pairs.levelMax)))
        assertThat(pairs.facts.map { it.label.key }).containsExactly(
            GameTextKey.SparksPocketLabel, GameTextKey.SparksLifetimeLabel, GameTextKey.SparksLevelLabel, GameTextKey.SparksLevelMaxLabel,
        ).inOrder()
    }
}
