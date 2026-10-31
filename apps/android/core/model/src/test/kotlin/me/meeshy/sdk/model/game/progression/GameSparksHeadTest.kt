package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameLevel
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import org.junit.Test

/**
 * La tête de la fiche des Étincelles (iOS `GameSparksHeadModel`, #11180) : TA LUMIÈRE en grand, et en petit ce qui a
 * été reçu depuis toujours — « 12 000 reçues depuis toujours », ou après une renaissance « 4 200 cet Âge · 12 000 en
 * tout » (`GameSparksCopy.cumulLine`) ; l'Ombre au-dessus quand une dette existe.
 */
class GameSparksHeadTest {

    private fun level(pocket: Long?, cycle: Long? = pocket, lifetime: Long? = cycle, debt: Long = 0): GameLevel {
        val json = buildJsonObject {
            GameBlockFixtures.level().forEach { (key, value) -> put(key, value) }
            if (pocket == null) {
                put("sparks", kotlinx.serialization.json.JsonNull)
            } else {
                put("sparks", JsonPrimitive(pocket))
                put("sparksCycle", JsonPrimitive(cycle))
                put("sparksLifetime", JsonPrimitive(lifetime))
            }
            put("sparksDebt", JsonPrimitive(debt))
        }
        val block = GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("level" to json)))
        return checkNotNull(block).level
    }

    @Test
    fun `sans renaissance le cumul se dit recu depuis toujours`() {
        val head = GameSparksHead.of(level(pocket = 976, cycle = 12_000, lifetime = 12_000))

        assertThat(head.pocket).isEqualTo(GameText.of(GameTextKey.SparksCount, GameTextArg.Count(976)))
        assertThat(head.lifetime).isEqualTo(GameText.of(GameTextKey.SparksRecordLine, GameTextArg.Count(12_000)))
        assertThat(head.shadow).isNull()
        assertThat(head.facts).containsExactly(ConceptFact.SparksPocket, ConceptFact.SparksLifetime).inOrder()
    }

    @Test
    fun `apres une renaissance cet Age passe avant le tout`() {
        val head = GameSparksHead.of(level(pocket = 300, cycle = 4_200, lifetime = 12_000))

        assertThat(head.lifetime).isEqualTo(
            GameText.of(GameTextKey.SparksCumulRecord, GameTextArg.Count(4_200), GameTextArg.Count(12_000)),
        )
    }

    @Test
    fun `l Ombre se dit au dessus et un serveur d avant les etincelles ne dit pas de cumul`() {
        val head = GameSparksHead.of(level(pocket = null, debt = 40))

        assertThat(head.lifetime).isNull()
        assertThat(head.shadow).isEqualTo(GameText.of(GameTextKey.SparksDebt, GameTextArg.Count(40)))
        assertThat(head.facts).containsExactly(ConceptFact.SparksDebt, ConceptFact.SparksPocket).inOrder()
    }

    @Test
    fun `un cumul au dela d un entier se borne sans changer de forme`() {
        val head = GameSparksHead.of(level(pocket = 5_000_000_000L, cycle = 6_000_000_000L, lifetime = 7_000_000_000L))

        assertThat(head.lifetime?.key).isEqualTo(GameTextKey.SparksCumulRecord)
        assertThat(head.pocket.args).containsExactly(GameTextArg.Count(Int.MAX_VALUE))
    }
}
