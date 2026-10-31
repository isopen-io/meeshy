package me.meeshy.app.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.AchievementCatalog
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementMilestoneType
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

/** Les sections d'une fiche (iOS `ProgressionSection`) : Médailles, Défis, Succès — leur parent, leur compte, leurs portes. */
class ProgressionSectionTest {

    private fun progress(
        counters: Map<EngagementAxisKey, Int> = emptyMap(),
        milestones: List<ApiEngagementProgress.Milestone> = emptyList(),
    ): EngagementProgress = EngagementProgressResolver.resolve(
        ApiEngagementProgress(
            counters = counters.map { (axis, count) -> ApiEngagementProgress.Counter(axis.wire, count) },
            milestones = milestones,
            streak = ApiEngagementProgress.Streak(0, 0),
            level = ApiEngagementProgress.Level(engagementScore = 0),
        ),
    )

    @Test
    fun `each section is reached from the fiche of its own concept, in the iOS order`() {
        assertThat(ProgressionSection.entries.map { it.wire }).containsExactly("badges", "defis", "succes").inOrder()
        assertThat(ProgressionSection.of(ProgressionConcept.Badges)).containsExactly(ProgressionSection.Badges)
        assertThat(ProgressionSection.of(ProgressionConcept.Defis)).containsExactly(ProgressionSection.Defis)
        assertThat(ProgressionSection.of(ProgressionConcept.Succes)).containsExactly(ProgressionSection.Succes)
        assertThat(ProgressionSection.fromWire("defis")).isEqualTo(ProgressionSection.Defis)
        assertThat(ProgressionSection.fromWire("nope")).isNull()
    }

    @Test
    fun `the medals page counts the badges earned on the badges served`() {
        val earned = progress(counters = mapOf(EngagementAxisKey.TEXT_MESSAGE to 12, EngagementAxisKey.POST to 1))

        val count = ProgressionSection.Badges.count(earned)

        assertThat(count).isEqualTo(SectionCount(earned.badgesEarned, earned.badgesTotal))
        assertThat(count.done).isGreaterThan(0)
    }

    @Test
    fun `the challenges page counts what is unlocked on what is attainable, all sections together`() {
        val messages = AchievementCatalog.families.first { it.id == "message.send.count" }
        val p = progress(milestones = listOf(ApiEngagementProgress.Milestone(EngagementMilestoneType.ACHIEVEMENT, messages.key(1), "2026-10-03T08:00:00.000Z")))

        val count = ProgressionSection.Defis.count(p)

        assertThat(count.done).isEqualTo(p.achievementSections.sumOf { it.unlockedCount })
        assertThat(count.total).isEqualTo(p.achievementSections.sumOf { it.attainableCount })
        assertThat(count.done).isEqualTo(1)
    }

    @Test
    fun `the great deeds page counts the named great deeds`() {
        val p = progress()

        assertThat(ProgressionSection.Succes.count(p)).isEqualTo(SectionCount(p.unlockedAchievementCount, p.achievements.size))
    }

    @Test
    fun `every badge of the shelf carries its guide, whose suite starts at the next star`() {
        val entry = BadgeShelf.of(progress(counters = mapOf(EngagementAxisKey.TEXT_MESSAGE to 37))).single().entries.single()

        assertThat(entry.guide.axis).isEqualTo(EngagementAxisKey.TEXT_MESSAGE)
        assertThat(entry.guide.next?.threshold).isEqualTo(50)
        assertThat(entry.guide.upcoming.first().threshold).isEqualTo(50)
    }

    @Test
    fun `a challenge opens as a consultation of its composed tier, obtained or not`() {
        val p = progress()
        val entry = p.achievementSections.first().entries.first()

        val request = ChallengeRequest.of(entry)

        assertThat(request.reveal).isEqualTo(EngagementReveal.ComposedAchievement(entry.family, entry.tier))
        assertThat(request.unlocked).isEqualTo(entry.unlocked)
        assertThat(request.reachedAt).isEqualTo(entry.reachedAt)
    }
}
