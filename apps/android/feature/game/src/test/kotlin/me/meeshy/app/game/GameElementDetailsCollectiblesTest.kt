package me.meeshy.app.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.game.progression.BadgeShelf
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.AtlasPending
import me.meeshy.sdk.model.game.AtlasStamp
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GamePrestigeBlock
import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.GameSeasonBlock
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueFriends
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.element.GameElementEmblem
import me.meeshy.sdk.model.game.element.GameElementKind
import me.meeshy.sdk.model.game.element.GameElementStatus
import me.meeshy.sdk.model.game.engagement.AchievementEntry
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementAchievementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementMilestoneType
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

/** Un cas obtenu et un cas verrouillé par famille de collection ; la rareté non mesurée ne dit rien. */
class GameElementDetailsCollectiblesTest {

    private val subject = GameElementDetailsCollectibles

    private fun name(value: String) = GameText.verbatim(value)

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

    private fun season(stars: Int = 6, steps: Int = 1, claimed: List<Int> = listOf(1), sealOwned: Boolean = false) = GameSeasonBlock(
        number = 3, themeKey = "aurora", startDay = "2026-10-26", endDay = "2026-12-20", week = 2,
        stars = stars, steps = steps, stepsTotal = 8, starsToNext = 2, progress = 0.5, completed = false,
        claimedSteps = claimed, sealOwned = sealOwned, sealPrice = 120,
    )

    private fun league(access: LeagueAccess = LeagueAccess.Open, toPromotion: Int? = 40) = GameLeagueBlock(
        unlocked = true, access = access, weekKey = "2026-10-26", closes = LeagueCloses("2026-11-01", 1200),
        current = LeagueCurrent(LeagueKey.Jade, "g1", groupSize = 30, rank = 7, weekPoints = 310, zone = LeagueZone.Safe, pointsToPromotion = toPromotion),
        friends = LeagueFriends(rank = 2, size = 5, weekPoints = 310),
    )

    @Test
    fun `un badge allume dit sa date servie, sa matiere et ses etoiles`() {
        val p = progress(
            counters = mapOf(EngagementAxisKey.TEXT_MESSAGE to 120),
            milestones = listOf(ApiEngagementProgress.Milestone(EngagementMilestoneType.BADGE, "${EngagementAxisKey.TEXT_MESSAGE.wire}:100", "2026-10-03T08:00:00.000Z")),
        )

        val detail = subject.badge(p.axes.first { it.axis == EngagementAxisKey.TEXT_MESSAGE }, name("Messages"))

        assertThat(detail.kind).isEqualTo(GameElementKind.Badge)
        assertThat(detail.status).isEqualTo(GameElementStatus.Obtained("2026-10-03T08:00:00.000Z"))
        assertThat((detail.emblem as GameElementEmblem.Badge).material).isEqualTo(GameMaterial.Gold)
        assertThat(detail.facts.map { it.label.key }).containsExactly(GameTextKey.BadgeMaterialLabel, GameTextKey.BadgeStarsLabel).inOrder()
        assertThat(detail.concept).isEqualTo(ProgressionConcept.Badges)
    }

    @Test
    fun `un badge eteint ou jamais gagne est verrouille avec ce qu il manque et sa jauge`() {
        val p = progress(
            counters = mapOf(EngagementAxisKey.REACTION to 13),
            milestones = listOf(ApiEngagementProgress.Milestone(EngagementMilestoneType.BADGE, "${EngagementAxisKey.REACTION.wire}:50", "2026-09-20T08:00:00.000Z")),
        )

        val dimmed = subject.badge(p.axes.first { it.axis == EngagementAxisKey.REACTION }, name("Réactions"))
        val never = subject.badge(p.axes.first { it.axis == EngagementAxisKey.FRIENDSHIP }, name("Amitié"))

        assertThat(dimmed.status).isEqualTo(GameElementStatus.Locked(GameText.of(GameTextKey.BadgeImprintMissing, GameTextArg.Count(37)), 0.0))
        assertThat(never.status).isInstanceOf(GameElementStatus.Locked::class.java)
        assertThat((never.status as GameElementStatus.Locked).missing?.key).isEqualTo(GameTextKey.DetailBadgeMissing)
        assertThat((never.emblem as GameElementEmblem.Badge).lit).isFalse()
        assertThat(never.id).isNotEqualTo(dimmed.id)
    }

    @Test
    fun `la boucle de l etagere et celle de la page ouvrent les memes precisions`() {
        val p = progress(counters = mapOf(EngagementAxisKey.POST to 12))
        val entry = BadgeShelf.of(p).single().entries.single()

        assertThat(subject.badge(entry, name("Posts"))).isEqualTo(subject.badge(p.axes.first { it.axis == EngagementAxisKey.POST }, name("Posts")))
    }

    @Test
    fun `un succes accompli porte sa date, un succes a faire sa condition, et la rarete non mesuree n est pas dite`() {
        val key = EngagementAchievementKey.entries.first()
        val measured = GameRarityEntry(AchievementRarity.Epic, holders = 60, population = 2000)
        val unmeasured = GameRarityEntry(AchievementRarity.Epic, holders = 5, population = 300)

        val done = subject.achievement(EngagementAchievementProgress(key, true, "2026-10-01T09:00:00.000Z"), name("Premier"), name("cond"), measured)
        val todo = subject.achievement(EngagementAchievementProgress(key, false, null), name("Premier"), name("cond"), unmeasured)

        assertThat(done.status).isEqualTo(GameElementStatus.Obtained("2026-10-01T09:00:00.000Z"))
        assertThat(done.rarity).isEqualTo(measured)
        assertThat(todo.status).isEqualTo(GameElementStatus.Locked(name("cond"), null))
        assertThat(todo.rarity).isNull()
    }

    @Test
    fun `un defi est obtenu a sa date ou verrouille, et une famille hors catalogue ne s invente pas`() {
        val p = progress()
        val locked: AchievementEntry = p.achievementSections.first().entries.first()

        val lockedDetail = subject.challenge(locked, name("Défi"), name("Section"))!!
        val obtained = subject.challenge(locked.copy(unlocked = true, reachedAt = "2026-10-01T09:00:00.000Z"), name("Défi"), null)!!

        assertThat(lockedDetail.status).isEqualTo(GameElementStatus.Locked(null, null))
        assertThat(lockedDetail.facts).hasSize(1)
        assertThat(obtained.status).isEqualTo(GameElementStatus.Obtained("2026-10-01T09:00:00.000Z"))
        assertThat(obtained.facts).isEmpty()
        assertThat(subject.challenge(locked, null, name("Section"))).isNull()
    }

    @Test
    fun `un trophee du proprietaire a sa date, celui d un visiteur le seul mois`() {
        val owner = subject.trophy("prestige:2", "2026-10-03T08:00:00.000Z", name("Renaissance 2"), GameMaterial.Prism)!!
        val visitor = subject.visitorTrophy("prestige:2", "2026-10-15", name("Renaissance 2"), GameMaterial.Prism)!!

        assertThat(owner.status).isEqualTo(GameElementStatus.Obtained("2026-10-03T08:00:00.000Z"))
        assertThat(visitor.status).isEqualTo(GameElementStatus.Obtained(null, GameText.of(GameTextKey.DetailEarnedOn, GameTextArg.Month("2026-10"))))
        assertThat(visitor.concept).isEqualTo(ProgressionConcept.Showcase)
        assertThat(subject.trophy("inconnu", "2026-10-03", null, GameMaterial.Gold)).isNull()
    }

    @Test
    fun `un tampon est date au jour servi, un echange a moitie fait dit le message qui manque`() {
        val stamped = subject.stamp(AtlasStamp("fr", "2026-10-03"), name("Français"))
        val sent = subject.pendingStamp(AtlasPending("es", sent = true, received = false), name("Espagnol"))
        val received = subject.pendingStamp(AtlasPending("de", sent = false, received = true), name("Allemand"))

        assertThat(stamped.status).isEqualTo(GameElementStatus.Obtained(null, GameText.of(GameTextKey.AtlasStampedOn, GameTextArg.Day("2026-10-03"))))
        assertThat(stamped.emblem).isEqualTo(GameElementEmblem.Stamp("FR", true))
        assertThat((sent.status as GameElementStatus.Locked).missing?.key).isEqualTo(GameTextKey.AtlasPendingSent)
        assertThat((received.status as GameElementStatus.Locked).missing?.key).isEqualTo(GameTextKey.AtlasPendingReceived)
        assertThat(sent.progress).isEqualTo(0.5)
        assertThat(sent.id).isNotEqualTo(subject.stamp(AtlasStamp("es", "2026-10-03"), name("Espagnol")).id)
    }

    @Test
    fun `une etape de saison est reclamee, prete ou verrouillee avec les pas qui manquent`() {
        val season = season(stars = 6, steps = 1, claimed = listOf(1))

        val claimed = subject.seasonStep(1, season)
        val ready = subject.seasonStep(1, season.copy(claimedSteps = emptyList()))
        val locked = subject.seasonStep(3, season)

        assertThat(claimed.status).isEqualTo(GameElementStatus.Obtained(null))
        assertThat((ready.status as GameElementStatus.Value).value.key).isEqualTo(GameTextKey.SeasonStepReady)
        val missing = (locked.status as GameElementStatus.Locked)
        assertThat(missing.progress).isWithin(1e-9).of(0.5)
        assertThat(missing.missing).isEqualTo(
            GameText.of(GameTextKey.SpendMissingUnlock, GameTextArg.Nested(GameText.of(GameTextKey.SeasonStars, GameTextArg.Count(6)))),
        )
        assertThat(locked.id).isEqualTo("step:3.3")
    }

    @Test
    fun `le Sceau est obtenu ou se prend contre des Meeshes`() {
        val owned = subject.seal(season(sealOwned = true))
        val open = subject.seal(season(sealOwned = false))

        assertThat(owned.status).isEqualTo(GameElementStatus.Obtained(null))
        assertThat((open.status as GameElementStatus.Locked).missing?.key).isEqualTo(GameTextKey.Meeshes)
        assertThat(open.concept).isEqualTo(ProgressionConcept.Season)
    }

    @Test
    fun `la gemme de la ligue dit la place, les points, la zone et la montee, jamais une presence`() {
        val gem = subject.leagueGem(league())!!

        assertThat(gem.emblem).isEqualTo(GameElementEmblem.League(LeagueKey.Jade))
        assertThat((gem.status as GameElementStatus.Value).value)
            .isEqualTo(GameText.of(GameTextKey.LeagueRankLine, GameTextArg.Count(7), GameTextArg.Count(30)))
        assertThat(gem.facts.map { it.label.key })
            .containsExactly(GameTextKey.FactWeekPoints, GameTextKey.FactZone, GameTextKey.FactMissingForPromotion).inOrder()
        assertThat(subject.leagueGem(league(toPromotion = 0))!!.facts).hasSize(2)
        assertThat(subject.leagueGem(league(access = LeagueAccess.Locked))).isNull()
    }

    @Test
    fun `une etoile de Prestige est obtenue, prete a renaitre ou verrouillee`() {
        val prestige = GamePrestigeBlock(stars = 1, max = 5, canPrestige = true, gloryOnPass = 900)

        val owned = subject.prestigeStar(1, prestige)
        val ready = subject.prestigeStar(2, prestige)
        val far = subject.prestigeStar(4, prestige)

        assertThat(owned.status).isEqualTo(GameElementStatus.Obtained(null))
        assertThat((ready.status as GameElementStatus.Locked).missing?.key).isEqualTo(GameTextKey.DoorPrestigeReady)
        assertThat((far.status as GameElementStatus.Locked).missing?.key).isEqualTo(GameTextKey.DoorPrestigeLocked)
        assertThat(owned.emblem).isEqualTo(GameElementEmblem.Trophy(GameMaterial.Prism))
    }
}
