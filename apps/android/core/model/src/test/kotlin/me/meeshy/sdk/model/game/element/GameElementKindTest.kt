package me.meeshy.sdk.model.game.element

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

/** La liste FERMÉE des familles (iOS `GameElementKind`, web `GAME_DETAIL_FAMILIES`) : elle ne bouge pas sans un témoin qui rougit. */
class GameElementKindTest {

    @Test
    fun `les dix-neuf familles du catalogue et leurs deux lignes de donnee gardent leurs segments de cle`() {
        assertThat(GameElementKind.entries.map { it.segment }).containsExactly(
            "badge", "succes", "defi", "trophy", "stamp", "step", "seal", "gem", "star", "rank", "flame", "freeze",
            "mission", "chest", "coin", "ring", "treasury", "elan", "levelstep", "fact", "player",
        ).inOrder()
        assertThat(GameElementKind.families).hasSize(19)
        assertThat(GameElementKind.families).containsNoneOf(GameElementKind.Fact, GameElementKind.Player)
    }

    @Test
    fun `seules la forme de Flamme, la mission, le coffre et la famille d elan disent ce qu elles donnent`() {
        val gives = GameElementKind.entries.filter { it.how == GameElementHow.Gives }

        assertThat(gives).containsExactly(GameElementKind.FlameForm, GameElementKind.Mission, GameElementKind.Chest, GameElementKind.ElanFamily)
    }

    @Test
    fun `chaque famille ouvre la fiche de son concept, sauf l etape des niveaux et la donnee qui portent le leur`() {
        assertThat(GameElementKind.Rank.concept).isEqualTo(ProgressionConcept.Glory)
        assertThat(GameElementKind.Freeze.concept).isEqualTo(ProgressionConcept.Flame)
        assertThat(GameElementKind.Coin.concept).isEqualTo(ProgressionConcept.Meesh)
        assertThat(GameElementKind.Player.concept).isEqualTo(ProgressionConcept.League)
        assertThat(GameElementKind.LevelStep.concept).isNull()
        assertThat(GameElementKind.Fact.concept).isNull()
        assertThat(GameElementKind.entries.filter { it.concept == null }).containsExactly(GameElementKind.LevelStep, GameElementKind.Fact)
    }
}
