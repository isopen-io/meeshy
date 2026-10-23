package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EngagementProgressResolverTest {

    private fun resolve(p: ApiEngagementProgress) = EngagementProgressResolver.resolve(p)

    private fun axis(progress: EngagementProgress, key: EngagementAxisKey) = progress.axes.first { it.axis == key }.scale

    @Test
    fun `une echelle vide ne progresse pas et pointe le premier palier`() {
        val scale = axis(resolve(payload()), EngagementAxisKey.POST)

        assertThat(scale.progress).isEqualTo(0.0)
        assertThat(scale.nextThreshold).isEqualTo(1)
        assertThat(scale.reachedCount).isEqualTo(0)
    }

    @Test
    fun `une echelle partielle se mesure depuis le dernier palier franchi et jamais depuis zero`() {
        val scale = axis(resolve(payload(counters = listOf(count("content.text_message", 30)))), EngagementAxisKey.TEXT_MESSAGE)

        assertThat(scale.previousThreshold).isEqualTo(10)
        assertThat(scale.nextThreshold).isEqualTo(50)
        assertThat(scale.progress).isWithin(1e-9).of(0.5)
        assertThat(scale.remainingToNext).isEqualTo(20)
    }

    @Test
    fun `une echelle complete vaut 1 sans palier suivant`() {
        val scale = axis(resolve(payload(counters = listOf(count("tool.sticker", 9000)))), EngagementAxisKey.STICKER)

        assertThat(scale.progress).isEqualTo(1.0)
        assertThat(scale.nextThreshold).isNull()
        assertThat(scale.reachedCount).isEqualTo(7)
        assertThat(scale.remainingToNext).isNull()
    }

    @Test
    fun `le niveau courant est le nombre de paliers franchis`() {
        assertThat(resolve(payload(score = 160)).level.level).isEqualTo(3)
        assertThat(resolve(payload(score = 5000)).level.level).isEqualTo(6)
        assertThat(resolve(payload(score = 5)).level.level).isEqualTo(0)
    }

    @Test
    fun `la serie qui court avance vers le jalon et le record tient un jalon pour atteint`() {
        val streak = resolve(payload(current = 8, longest = 20)).streak

        assertThat(streak.scale.nextThreshold).isEqualTo(14)
        assertThat(streak.scale.reachedCount).isEqualTo(3)
        assertThat(streak.scale.progress).isWithin(1e-6).of(1.0 / 7)
    }

    @Test
    fun `un record inferieur a la serie courante est ramene a elle`() {
        val streak = resolve(payload(current = 7, longest = 2)).streak

        assertThat(streak.longestDays).isEqualTo(7)
        assertThat(streak.scale.reachedCount).isEqualTo(2)
    }

    @Test
    fun `un palier grave sans compteur reste atteint`() {
        val progress = resolve(payload(milestones = listOf(milestone(EngagementMilestoneType.BADGE, "content.post:1"))))

        assertThat(axis(progress, EngagementAxisKey.POST).reachedCount).isEqualTo(1)
        assertThat(progress.isEmpty).isFalse()
    }

    @Test
    fun `un axe hors catalogue est ignore et l ecran reste vide`() {
        val progress = resolve(payload(counters = listOf(count("alien.axis", 99))))

        assertThat(progress.isEmpty).isTrue()
        assertThat(progress.axes).hasSize(20)
    }

    @Test
    fun `les valeurs negatives valent zero`() {
        val progress = resolve(payload(counters = listOf(count("content.post", -4)), score = -1, current = -2))

        assertThat(progress.isEmpty).isTrue()
    }

    @Test
    fun `l elan n est accelere qu a partir de x2`() {
        assertThat(resolve(payload(elan = elan(1.0))).elan!!.isAccelerated).isFalse()
        assertThat(resolve(payload(elan = elan(1.4))).elan!!.isAccelerated).isTrue()
        assertThat(resolve(payload(elan = elan(2.0))).elan!!.isAccelerated).isTrue()
    }

    @Test
    fun `l elan est borne a 5 et ignore les familles inconnues`() {
        val elan = resolve(payload(elan = elan(9.0, listOf("content", "alien", "social", "content")))).elan!!

        assertThat(elan.factor).isEqualTo(5.0)
        assertThat(elan.activeFamilies).containsExactly(EngagementAxisFamily.CONTENT, EngagementAxisFamily.SOCIAL).inOrder()
    }

    @Test
    fun `sans liste de familles actives l elan n en invente aucune`() {
        assertThat(resolve(payload(elan = elan(3.0, null))).elan!!.activeFamilies).isEmpty()
    }

    @Test
    fun `un serveur anterieur sans meesh ni elan ne montre rien`() {
        val progress = resolve(payload())

        assertThat(progress.meesh).isNull()
        assertThat(progress.elan).isNull()
    }

    @Test
    fun `la frappe n est possible que si les points debitables couvrent le prix`() {
        val short = resolve(payload(meesh = meesh(debitable = 500, cost = 1000))).meesh!!
        val enough = resolve(payload(meesh = meesh(debitable = 1000, cost = 1000))).meesh!!

        assertThat(short.canMint).isFalse()
        assertThat(short.progress).isWithin(1e-9).of(0.5)
        assertThat(enough.canMint).isTrue()
        assertThat(enough.progress).isEqualTo(1.0)
    }

    @Test
    fun `un prix nul ne permet pas la frappe`() {
        val m = resolve(payload(meesh = meesh(debitable = 50, cost = 0))).meesh!!

        assertThat(m.canMint).isFalse()
        assertThat(m.progress).isEqualTo(0.0)
    }

    @Test
    fun `une date de frappe illisible devient absente`() {
        val m = resolve(payload(meesh = meesh(1, 2, first = "2026-09-01T08:00:00Z", last = "pas une date"))).meesh!!

        assertThat(m.firstMintedAt).isEqualTo("2026-09-01T08:00:00Z")
        assertThat(m.lastMintedAt).isNull()
    }

    @Test
    fun `le heros est le dernier succes obtenu sinon le prochain`() {
        val none = resolve(payload()).heroAchievement
        assertThat(none!!.key).isEqualTo(EngagementAchievementKey.FIRST_CONTENT)
        assertThat(none.unlocked).isFalse()

        val two = resolve(
            payload(
                milestones = listOf(
                    milestone(EngagementMilestoneType.ACHIEVEMENT, "achievement.first_content", "2026-09-01T08:00:00.000Z"),
                    milestone(EngagementMilestoneType.ACHIEVEMENT, "achievement.editor", "2026-09-09T08:00:00.000Z"),
                ),
            ),
        )
        assertThat(two.heroAchievement!!.key).isEqualTo(EngagementAchievementKey.EDITOR)
        assertThat(two.unlockedAchievementCount).isEqualTo(2)
    }

    @Test
    fun `les axes se rangent par famille dans l ordre du modele`() {
        val families = resolve(payload()).axesByFamily.map { it.family }

        assertThat(families).containsExactly(
            EngagementAxisFamily.CONTENT, EngagementAxisFamily.COMMENT, EngagementAxisFamily.CONVERSATION,
            EngagementAxisFamily.TOOL, EngagementAxisFamily.SOCIAL,
        ).inOrder()
    }

    @Test
    fun `le catalogue des succes existe meme sans carte d atteignabilite`() {
        val sections = resolve(payload(reach = null)).achievementSections

        assertThat(sections).isNotEmpty()
        assertThat(sections.first().entries.size).isAtMost(7)
    }

    @Test
    fun `la fenetre des succes s ouvre de deux en deux`() {
        assertThat(AchievementCatalog.windowSize(0)).isEqualTo(7)
        assertThat(AchievementCatalog.windowSize(10)).isEqualTo(12)
    }

    @Test
    fun `une ampleur non mesuree est masquee et un volume reste visible`() {
        val entries = resolve(payload(reach = emptyMap())).achievementSections.flatMap { it.entries }

        assertThat(entries.none { it.family.scale == "size" }).isTrue()
        assertThat(entries.any { it.family.scale == "count" }).isTrue()
    }

    @Test
    fun `une ampleur mesuree n expose que les paliers qu elle atteint`() {
        val family = AchievementCatalog.families.first { it.id == "conversation.join.size" }
        val reach = mapOf("conversation.join.size" to 100)

        assertThat(family.tiers.filter { AchievementCatalog.isAttainable(family, it, reach) }).containsExactly(10, 100).inOrder()
    }
}
