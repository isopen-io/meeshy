package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress
import org.junit.Test

/** « Comment gagner » (iOS `GameHero.earnItems`) : une puce par famille du barème, par poids décroissant. */
class GameHeroEarnTest {

    private fun elan(vararg active: EngagementAxisFamily) = EngagementElanProgress(
        factor = 1.5, activeFamilyCount = active.size, hasStanding = true, windowDays = 7,
        isAccelerated = true, activeFamilies = active.toList(),
    )

    @Test
    fun `une puce par famille du bareme triee par poids decroissant`() {
        assertThat(GameHeroEarn.items().map { it.family to it.weight }).containsExactly(
            EngagementAxisFamily.CONTENT to 1000,
            EngagementAxisFamily.COMMENT to 100,
            EngagementAxisFamily.SOCIAL to 7,
            EngagementAxisFamily.CONVERSATION to 5,
            EngagementAxisFamily.TOOL to 4,
        ).inOrder()
    }

    @Test
    fun `a poids egal l ordre du catalogue decide`() {
        val flat = EngagementAxisFamily.entries.associateWith { 10 }
        assertThat(GameHeroEarn.items(flat).map { it.family }).containsExactlyElementsIn(EngagementAxisFamily.entries).inOrder()
        val tied = mapOf(EngagementAxisFamily.TOOL to 9, EngagementAxisFamily.CONTENT to 9, EngagementAxisFamily.SOCIAL to 20)
        assertThat(GameHeroEarn.items(tied).map { it.family })
            .containsExactly(EngagementAxisFamily.SOCIAL, EngagementAxisFamily.CONTENT, EngagementAxisFamily.TOOL).inOrder()
    }

    @Test
    fun `une famille est active d apres l elan servi et inactive devant un ancien serveur`() {
        val served = GameHeroEarn.items(elan = elan(EngagementAxisFamily.COMMENT)).associate { it.family to it.active }
        assertThat(served[EngagementAxisFamily.COMMENT]).isTrue()
        assertThat(served[EngagementAxisFamily.CONTENT]).isFalse()
        assertThat(GameHeroEarn.items(elan = null).none { it.active }).isTrue()
    }
}
