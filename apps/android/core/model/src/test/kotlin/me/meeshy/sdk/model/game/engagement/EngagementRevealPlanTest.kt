package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EngagementRevealPlanTest {

    private val achievement = EngagementReveal.Achievement(EngagementAchievementKey.FIRST_VOICE)
    private val composed = EngagementReveal.ComposedAchievement(AchievementCatalog.families.first { it.id == "message.send.count" }, 1000)
    private val badge = EngagementReveal.Badge("content.text_message", 100)

    @Test
    fun `a celebration of an achievement is purple, lit, rayed and leads to the progression`() {
        val plan = EngagementRevealPlan.of(achievement, RevealOccasion.Celebration)

        assertThat(plan.banner).isEqualTo(RevealBanner.Achievement)
        assertThat(plan.tint).isEqualTo(RevealTint.Achievement)
        assertThat(plan.symbol).isEqualTo(RevealSymbol.Rosette)
        assertThat(plan.raysWhenMotionAllowed).isTrue()
        assertThat(plan.celebratesWithSuccessHaptic).isTrue()
        assertThat(plan.leadsToProgression).isTrue()
        assertThat(plan.medal).isNull()
    }

    @Test
    fun `each milestone form has its own banner, tint and symbol`() {
        val streak = EngagementRevealPlan.of(EngagementReveal.Streak(7), RevealOccasion.Celebration)
        val level = EngagementRevealPlan.of(EngagementReveal.Level(4), RevealOccasion.Celebration)

        assertThat(streak.banner).isEqualTo(RevealBanner.Streak)
        assertThat(streak.tint).isEqualTo(RevealTint.Streak)
        assertThat(streak.symbol).isEqualTo(RevealSymbol.Flame)
        assertThat(level.banner).isEqualTo(RevealBanner.Level)
        assertThat(level.tint).isEqualTo(RevealTint.Level)
        assertThat(level.symbol).isEqualTo(RevealSymbol.StarCircle)
    }

    @Test
    fun `a badge of a known axis wears the medal of its tier material`() {
        val plan = EngagementRevealPlan.of(badge, RevealOccasion.Celebration)

        assertThat(plan.tint).isEqualTo(RevealTint.Badge)
        assertThat(plan.medal).isEqualTo(RevealMedalSpec(EngagementAxisKey.TEXT_MESSAGE, 100, BadgeMaterialKey.OR))
    }

    @Test
    fun `a badge of an axis this client does not know keeps the symbol, never an invented medal`() {
        val plan = EngagementRevealPlan.of(EngagementReveal.Badge("content.hologram", 10), RevealOccasion.Celebration)

        assertThat(plan.medal).isNull()
        assertThat(plan.symbol).isEqualTo(RevealSymbol.Medal)
    }

    @Test
    fun `a threshold that is not a tier takes the highest material it covers`() {
        val plan = EngagementRevealPlan.of(EngagementReveal.Badge("content.post", 600), RevealOccasion.Celebration)

        assertThat(plan.medal!!.material).isEqualTo(BadgeMaterialKey.PLATINE)
    }

    @Test
    fun `consulting a locked achievement is grey, lock symbol, no rays, no medal, no success haptic`() {
        val plan = EngagementRevealPlan.of(badge, RevealOccasion.Consultation(unlocked = false, reachedAt = null))

        assertThat(plan.banner).isEqualTo(RevealBanner.Locked)
        assertThat(plan.tint).isEqualTo(RevealTint.Locked)
        assertThat(plan.symbol).isEqualTo(RevealSymbol.Lock)
        assertThat(plan.medal).isNull()
        assertThat(plan.raysWhenMotionAllowed).isFalse()
        assertThat(plan.celebratesWithSuccessHaptic).isFalse()
        assertThat(plan.leadsToProgression).isFalse()
    }

    @Test
    fun `consulting an obtained achievement says when, or just that it is obtained`() {
        val dated = EngagementRevealPlan.of(achievement, RevealOccasion.Consultation(unlocked = true, reachedAt = "2026-09-03T10:00:00Z"))
        val undated = EngagementRevealPlan.of(achievement, RevealOccasion.Consultation(unlocked = true, reachedAt = null))

        assertThat(dated.banner).isEqualTo(RevealBanner.ObtainedOn("2026-09-03T10:00:00Z"))
        assertThat(undated.banner).isEqualTo(RevealBanner.Obtained)
        assertThat(dated.raysWhenMotionAllowed).isTrue()
        assertThat(dated.celebratesWithSuccessHaptic).isFalse()
    }

    @Test
    fun `the title says the word, never the technical key`() {
        assertThat(EngagementRevealPlan.of(achievement, RevealOccasion.Celebration).title)
            .isEqualTo(RevealTitle.Legacy(EngagementAchievementKey.FIRST_VOICE))
        assertThat(EngagementRevealPlan.of(composed, RevealOccasion.Celebration).title)
            .isEqualTo(RevealTitle.Composed(composed.family, 1000))
        assertThat(EngagementRevealPlan.of(badge, RevealOccasion.Celebration).title)
            .isEqualTo(RevealTitle.BadgeTier(EngagementAxisKey.TEXT_MESSAGE, 100))
        assertThat(EngagementRevealPlan.of(EngagementReveal.Badge("content.hologram", 10), RevealOccasion.Celebration).title)
            .isEqualTo(RevealTitle.UnknownBadgeTier(10))
        assertThat(EngagementRevealPlan.of(EngagementReveal.Streak(7), RevealOccasion.Celebration).title).isEqualTo(RevealTitle.Streak(7))
        assertThat(EngagementRevealPlan.of(EngagementReveal.Level(4), RevealOccasion.Celebration).title).isEqualTo(RevealTitle.Level(4))
    }

    @Test
    fun `the subtitle of a composed achievement names the section it is filed in`() {
        val plan = EngagementRevealPlan.of(composed, RevealOccasion.Celebration)

        assertThat(plan.subtitle).isEqualTo(RevealSubtitle.Composed(section = "parole"))
    }
}
