package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.AchievementResolver
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementMeeshProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

class ProgressionLayoutTest {

    private fun base(): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty).copy(achievementSections = emptyList())

    private fun meesh() = EngagementMeeshProgress(
        balance = 0, mintedLifetime = 0, debitablePoints = 0, floorPoints = 0, missingPoints = 0,
        mintCost = 100, canMint = false, progress = 0.0, firstMintedAt = null, lastMintedAt = null,
    )

    private fun withDefis(p: EngagementProgress) =
        p.copy(achievementSections = AchievementResolver.sections(emptyMap(), emptyMap()))

    private val heroes = listOf(
        ProgressionBlock.LastAchievement, ProgressionBlock.Level, ProgressionBlock.Elans, ProgressionBlock.Flamme,
    )

    @Test
    fun `un compte vide sert les heros et les portes Badges et Succes, sans Meesh ni Defis`() {
        assertThat(ProgressionLayout.blocks(base())).containsExactlyElementsIn(
            heroes + listOf(
                ProgressionBlock.SectionLink(ProgressionConcept.Badges),
                ProgressionBlock.SectionLink(ProgressionConcept.Succes),
            ),
        ).inOrder()
    }

    @Test
    fun `les Meesh se posent sous le niveau quand le solde est servi`() {
        val blocks = ProgressionLayout.blocks(base().copy(meesh = meesh()))

        assertThat(blocks.take(5)).containsExactly(
            ProgressionBlock.LastAchievement, ProgressionBlock.Level, ProgressionBlock.Meesh,
            ProgressionBlock.Elans, ProgressionBlock.Flamme,
        ).inOrder()
    }

    @Test
    fun `la porte des Defis n existe que s il y a des defis et se place entre Badges et Succes`() {
        val blocks = ProgressionLayout.blocks(withDefis(base()))

        assertThat(blocks.filterIsInstance<ProgressionBlock.SectionLink>().map { it.section }).containsExactly(
            ProgressionConcept.Badges, ProgressionConcept.Defis, ProgressionConcept.Succes,
        ).inOrder()
    }
}
