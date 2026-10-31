package me.meeshy.app.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.engagement.AchievementCatalog
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementMilestoneType
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.engagement.RevealOccasion
import me.meeshy.sdk.model.game.engagement.RevealTitle
import org.junit.Test

class ProgressionRevealTest {

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

    private fun achievement(key: String, at: String) = ApiEngagementProgress.Milestone(EngagementMilestoneType.ACHIEVEMENT, key, at)

    private fun badge(axis: EngagementAxisKey, threshold: Int, at: String) =
        ApiEngagementProgress.Milestone(EngagementMilestoneType.BADGE, "${axis.wire}:$threshold", at)

    private val messages = AchievementCatalog.families.first { it.id == "message.send.count" }

    @Test
    fun `the hero opens the latest obtained great deed, named or composed, as a consultation at its date`() {
        val hero = AchievementHero.of(
            progress(
                milestones = listOf(
                    achievement(EngagementAchievementKey.FIRST_VOICE.wire, "2026-09-01T08:00:00.000Z"),
                    achievement(messages.key(1), "2026-10-03T08:00:00.000Z"),
                ),
            ),
        )

        assertThat(hero).isInstanceOf(AchievementHero.Obtained::class.java)
        val obtained = hero as AchievementHero.Obtained
        assertThat(obtained.title).isEqualTo(RevealTitle.Composed(messages, 1))
        assertThat(obtained.request.reveal).isEqualTo(EngagementReveal.ComposedAchievement(messages, 1))
        assertThat(obtained.request.occasion).isEqualTo(RevealOccasion.Consultation(unlocked = true, reachedAt = "2026-10-03T08:00:00.000Z"))
    }

    @Test
    fun `without anything obtained the hero names the next locked great deed and opens it locked`() {
        val hero = AchievementHero.of(progress())

        assertThat(hero).isEqualTo(
            AchievementHero.Next(
                EngagementAchievementKey.FIRST_CONTENT,
                ProgressionRevealRequest(EngagementReveal.Achievement(EngagementAchievementKey.FIRST_CONTENT), null, unlocked = false),
            ),
        )
        assertThat(hero.request?.occasion).isEqualTo(RevealOccasion.Consultation(unlocked = false, reachedAt = null))
    }

    @Test
    fun `an obtained great deed with an unreadable date does not compete and the hero opens nothing`() {
        val hero = AchievementHero.of(progress(milestones = listOf(achievement(EngagementAchievementKey.FIRST_VOICE.wire, "hier"))))

        assertThat(hero).isEqualTo(AchievementHero.First)
        assertThat(hero.request).isNull()
    }

    @Test
    fun `each great deed row opens its own consultation, obtained or locked, with its measured rarity`() {
        val epic = GameRarityEntry(AchievementRarity.Epic, holders = 40, population = 1_000)
        val rows = AchievementRow.of(
            progress(milestones = listOf(achievement(EngagementAchievementKey.EDITOR.wire, "2026-10-03T08:00:00.000Z"))),
            rarities = mapOf(EngagementAchievementKey.EDITOR.wire to epic),
            hidden = false,
        )

        val editor = rows.first { it.achievement.key == EngagementAchievementKey.EDITOR }
        assertThat(editor.rarity).isEqualTo(epic)
        assertThat(editor.request.occasion).isEqualTo(RevealOccasion.Consultation(unlocked = true, reachedAt = "2026-10-03T08:00:00.000Z"))
        val voice = rows.first { it.achievement.key == EngagementAchievementKey.FIRST_VOICE }
        assertThat(voice.request.occasion).isEqualTo(RevealOccasion.Consultation(unlocked = false, reachedAt = null))
        assertThat(rows.map { it.achievement.key }).containsExactlyElementsIn(EngagementAchievementKey.entries).inOrder()
    }

    @Test
    fun `under game hidden no rarity travels with a row`() {
        val epic = GameRarityEntry(AchievementRarity.Epic, holders = 40, population = 1_000)

        val rows = AchievementRow.of(progress(), mapOf(EngagementAchievementKey.EDITOR.wire to epic), hidden = true)

        assertThat(rows.mapNotNull { it.rarity }).isEmpty()
    }

    @Test
    fun `the shelf shows one medal per earned axis, at its highest tier, grouped by family in catalogue order`() {
        val shelf = BadgeShelf.of(
            progress(
                counters = mapOf(EngagementAxisKey.FRIENDSHIP to 12, EngagementAxisKey.TEXT_MESSAGE to 120, EngagementAxisKey.STORY to 0),
                milestones = listOf(badge(EngagementAxisKey.TEXT_MESSAGE, 100, "2026-10-03T08:00:00.000Z")),
            ),
        )

        assertThat(shelf.map { it.family }).containsExactly(EngagementAxisFamily.CONTENT, EngagementAxisFamily.SOCIAL).inOrder()
        val text = shelf.first().entries.single()
        assertThat(text.axis).isEqualTo(EngagementAxisKey.TEXT_MESSAGE)
        assertThat(text.threshold).isEqualTo(100)
        assertThat(text.material).isEqualTo(BadgeMaterialKey.OR)
        assertThat(text.lit).isTrue()
        assertThat(text.stars).isEqualTo(4)
        assertThat(text.nextThreshold).isEqualTo(500)
        assertThat(text.request).isEqualTo(
            ProgressionRevealRequest(EngagementReveal.Badge(EngagementAxisKey.TEXT_MESSAGE.wire, 100), "2026-10-03T08:00:00.000Z", unlocked = true),
        )
    }

    @Test
    fun `a medal dimmed by a strike stays on the shelf as an imprint and still opens as obtained`() {
        val shelf = BadgeShelf.of(
            progress(
                counters = mapOf(EngagementAxisKey.REACTION to 13),
                milestones = listOf(badge(EngagementAxisKey.REACTION, 50, "2026-09-20T08:00:00.000Z")),
            ),
        )

        val reaction = shelf.single().entries.single()
        assertThat(reaction.threshold).isEqualTo(50)
        assertThat(reaction.lit).isFalse()
        assertThat(reaction.missing).isEqualTo(37)
        assertThat(reaction.progress).isEqualTo(0.0)
        assertThat(reaction.request.occasion).isEqualTo(RevealOccasion.Consultation(unlocked = true, reachedAt = "2026-09-20T08:00:00.000Z"))
    }

    @Test
    fun `before the first medal the shelf is empty`() {
        assertThat(BadgeShelf.of(progress())).isEmpty()
    }
}
