package me.meeshy.app.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementMilestoneType
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

/**
 * Les précisions d'une médaille ou d'un défi (miroir de `GameElementDetails.badge` / `.challenge`, iOS) : gagnée à sa
 * date, éteinte avec ce qu'il manque pour la rallumer, jamais gagnée avec ce qu'il manque pour la première étoile.
 */
class GameElementDetailTest {

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

    private fun badge(axis: EngagementAxisKey, threshold: Int, at: String) =
        ApiEngagementProgress.Milestone(EngagementMilestoneType.BADGE, "${axis.wire}:$threshold", at)

    private fun EngagementProgress.axis(key: EngagementAxisKey) = axes.first { it.axis == key }

    @Test
    fun `an earned medal is obtained at the date engraved on its highest tier, with its guide`() {
        val p = progress(
            counters = mapOf(EngagementAxisKey.TEXT_MESSAGE to 120),
            milestones = listOf(badge(EngagementAxisKey.TEXT_MESSAGE, 100, "2026-10-03T08:00:00.000Z")),
        )

        val detail = GameElementDetails.badge(p.axis(EngagementAxisKey.TEXT_MESSAGE))

        assertThat(detail.axis).isEqualTo(EngagementAxisKey.TEXT_MESSAGE)
        assertThat(detail.material).isEqualTo(BadgeMaterialKey.OR)
        assertThat(detail.lit).isTrue()
        assertThat(detail.status).isEqualTo(GameElementStatus.Obtained("2026-10-03T08:00:00.000Z"))
        assertThat(detail.progress).isNull()
        assertThat(detail.lockedLook).isFalse()
        assertThat(detail.guide.stars).isEqualTo(4)
        assertThat(detail.guide.next?.threshold).isEqualTo(500)
        assertThat(detail.concept).isEqualTo(ProgressionConcept.Badges)
    }

    @Test
    fun `the shelf and the medals page open the same details for the same axis`() {
        val p = progress(counters = mapOf(EngagementAxisKey.POST to 12))
        val entry = BadgeShelf.of(p).single().entries.single()

        assertThat(GameElementDetails.badge(entry)).isEqualTo(GameElementDetails.badge(p.axis(EngagementAxisKey.POST)))
    }

    @Test
    fun `a medal dimmed by a strike is locked, says what relights it, and its gauge starts empty`() {
        val p = progress(
            counters = mapOf(EngagementAxisKey.REACTION to 13),
            milestones = listOf(badge(EngagementAxisKey.REACTION, 50, "2026-09-20T08:00:00.000Z")),
        )

        val detail = GameElementDetails.badge(p.axis(EngagementAxisKey.REACTION))

        assertThat(detail.material).isEqualTo(BadgeMaterialKey.ARGENT)
        assertThat(detail.lit).isFalse()
        assertThat(detail.status).isEqualTo(GameElementStatus.Locked(GameElementMissing.Rekindle(37), progress = 0.0))
        assertThat(detail.lockedLook).isTrue()
    }

    @Test
    fun `a medal never earned opens locked, aiming at its first star with what it lacks and its gauge`() {
        val p = progress()

        val detail = GameElementDetails.badge(p.axis(EngagementAxisKey.FRIENDSHIP))

        assertThat(detail.lit).isFalse()
        assertThat(detail.material).isEqualTo(BadgeMaterialKey.CUIVRE)
        assertThat(detail.status).isEqualTo(GameElementStatus.Locked(GameElementMissing.FirstStar(1), progress = 0.0))
        assertThat(detail.guide.reached).isNull()
        assertThat(detail.id).isNotEqualTo(GameElementDetails.badge(p.axis(EngagementAxisKey.STORY)).id)
    }

    @Test
    fun `a challenge is obtained at its date or locked without a gauge, and belongs to the challenges`() {
        val p = progress()
        val locked = p.achievementSections.first().entries.first()
        check(!locked.unlocked)

        val lockedDetail = GameElementDetails.challenge(locked)
        val obtained = GameElementDetails.challenge(locked.copy(unlocked = true, reachedAt = "2026-10-01T09:00:00.000Z"))

        assertThat(lockedDetail.status).isEqualTo(GameElementStatus.Locked(missing = null, progress = null))
        assertThat(lockedDetail.progress).isNull()
        assertThat(lockedDetail.concept).isEqualTo(ProgressionConcept.Defis)
        assertThat(obtained.status).isEqualTo(GameElementStatus.Obtained("2026-10-01T09:00:00.000Z"))
        assertThat(obtained.lockedLook).isFalse()
    }
}
