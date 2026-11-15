package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameOptimisticFixtures.chest
import me.meeshy.sdk.model.game.GameOptimisticFixtures.flame
import me.meeshy.sdk.model.game.GameOptimisticFixtures.game
import me.meeshy.sdk.model.game.GameOptimisticFixtures.meesh
import me.meeshy.sdk.model.game.GameOptimisticFixtures.mission
import me.meeshy.sdk.model.game.GameOptimisticFixtures.state
import org.junit.Test

class GameOptimisticTest {

    private fun assertSynced(s: GameState) = assertThat(s.meesh?.balance).isEqualTo(s.game.treasury.held)

    @Test
    fun `afterMint baisse le niveau par la loi et monte le tresor et le solde de un`() {
        val score = GameLevels.threshold(34) + 100
        val s = state(game(score = score, held = 9), meesh(balance = 9, minted = 12, debitable = score.toInt()))
        val price = s.game.mint.price

        val next = GameOptimistic.afterMint(s)

        assertThat(next.game.level.score).isEqualTo(score - price)
        assertThat(next.game.level.shown.level).isEqualTo(GameLevels.levelForScore(score - price, GameLevels.CAP_BASE))
        assertThat(next.game.level.shown.level).isLessThan(s.game.level.shown.level)
        assertThat(next.game.treasury.held).isEqualTo(10)
        assertThat(next.meesh?.balance).isEqualTo(10)
        assertThat(next.meesh?.mintedLifetime).isEqualTo(13)
        assertSynced(next)
    }

    @Test
    fun `afterMint ajoute la Gloire de la frappe et relit le rang`() {
        val s = state()
        val next = GameOptimistic.afterMint(s)
        assertThat(next.game.glory.glory).isEqualTo(s.game.glory.glory + s.game.mint.gloryGained)
    }

    @Test
    fun `afterMint lit le niveau sur la poche et laisse cycle et total a vie`() {
        val s = state(game(score = 60_000, sparks = true), meesh(debitable = 60_000))
        val price = s.game.mint.price

        val next = GameOptimistic.afterMint(s)

        assertThat(next.game.level.sparks).isEqualTo(60_000L - price)
        assertThat(next.game.level.sparksCycle).isEqualTo(60_500L)
        assertThat(next.game.level.sparksLifetime).isEqualTo(60_900L)
        assertThat(next.game.level.shown.level).isEqualTo(GameLevels.levelForScore(60_000L - price, GameLevels.CAP_BASE))
        assertThat(next.game.level.levelMaxLifetime).isAtLeast(10)
    }

    @Test
    fun `afterMint annonce le prix suivant de la loi des etincelles`() {
        val s = state(game(score = 60_000, sparks = true), meesh(debitable = 60_000))
        val next = GameOptimistic.afterMint(s)
        val expected = GameMint.sparksPreview(
            sparks = 60_000L - s.game.mint.price, mintedLifetime = s.game.mint.number, held = 10,
            glory = next.game.glory.glory, levelCap = GloryLaws.levelCap(next.game.glory.rank), steps = null,
        )
        assertThat(next.game.mint.price).isEqualTo(expected.price)
        assertThat(next.meesh?.mintCost).isEqualTo(expected.price)
    }

    @Test
    fun `afterMint impossible rend la meme instance`() {
        val s = state(game(score = 100, held = 9), meesh(debitable = 100))
        assertThat(s.game.mint.canMint).isFalse()
        assertThat(GameOptimistic.afterMint(s)).isSameInstanceAs(s)
    }

    @Test
    fun `afterFreeze achete un gel et debite les deux lectures du solde`() {
        val s = state(game(held = 5), meesh(balance = 5))
        val next = GameOptimistic.afterFreeze(s)
        assertThat(next.game.flame.freezes).isEqualTo(2)
        assertThat(next.game.treasury.held).isEqualTo(4)
        assertThat(next.meesh?.balance).isEqualTo(4)
        assertSynced(next)
    }

    @Test
    fun `afterFreeze au maximum ou sans solde rend la meme instance`() {
        val atMax = state(game(flame = flame(freezes = 2)))
        assertThat(GameOptimistic.afterFreeze(atMax)).isSameInstanceAs(atMax)
        val broke = state(game(held = 0), meesh(balance = 0))
        assertThat(GameOptimistic.afterFreeze(broke)).isSameInstanceAs(broke)
    }

    @Test
    fun `afterReroll consomme le changement et un Meesh sans deviner la mission`() {
        val s = state(game(held = 3), meesh(balance = 3))
        val next = GameOptimistic.afterReroll(s)
        assertThat(next.game.missions.rerollAvailable).isFalse()
        assertThat(next.game.missions.items).isEqualTo(s.game.missions.items)
        assertThat(next.meesh?.balance).isEqualTo(2)
        assertSynced(next)
    }

    @Test
    fun `afterReroll indisponible rend la meme instance`() {
        val s = state(game(rerollAvailable = false))
        assertThat(GameOptimistic.afterReroll(s)).isSameInstanceAs(s)
    }

    @Test
    fun `withRerolled remplace la mission au meme rang et pose le solde servi`() {
        val s = state(game(held = 2), meesh(balance = 2))
        val served = mission("m9")
        val next = GameOptimistic.withRerolled(s, "m1", served, balance = 7)
        assertThat(next.game.missions.items.map { it.id }).containsExactly("m9", "m2").inOrder()
        assertThat(next.game.treasury.held).isEqualTo(7)
        assertThat(next.meesh?.balance).isEqualTo(7)
    }

    @Test
    fun `afterChestOpening reclame sans inventer le contenu`() {
        val next = GameOptimistic.afterChestOpening(state())
        assertThat(next.game.chest.status).isEqualTo(ChestStatus.Claimed)
        assertThat(next.game.chest.reward).isNull()
    }

    @Test
    fun `afterChestOpening hors etat pret rend la meme instance`() {
        val s = state(game(chestStatus = ChestStatus.Claimed))
        assertThat(GameOptimistic.afterChestOpening(s)).isSameInstanceAs(s)
    }

    @Test
    fun `withChestReward pose le contenu servi et rembourse la dette sur les etincelles`() {
        val s = state(game(score = 10_000, sparks = true))
        val reward = DailyChest(points = 2_000, fragment = true, freeze = false, glory = 200)
        val next = GameOptimistic.withChestReward(s, reward, score = 12_000, starFragments = StarFragmentsTotal(5))

        assertThat(next.game.chest.status).isEqualTo(ChestStatus.Claimed)
        assertThat(next.game.chest.reward).isEqualTo(reward)
        assertThat(next.game.level.sparks).isEqualTo(12_000L)
        assertThat(next.game.level.sparksCycle).isEqualTo(12_500L)
        assertThat(next.game.level.sparksLifetime).isEqualTo(12_900L)
        assertThat(next.game.starFragments).isEqualTo(StarFragmentsTotal(5))
        assertThat(next.game.glory).isEqualTo(s.game.glory)
        assertThat(next.meesh?.debitablePoints).isEqualTo(12_000)
    }

    @Test
    fun `withChestReward sans total de fragments garde celui du bloc`() {
        val s = state(game(sparks = true))
        val next = GameOptimistic.withChestReward(s, DailyChest(500, false, false), score = 40_500)
        assertThat(next.game.starFragments).isEqualTo(StarFragmentsTotal(4))
    }

    @Test
    fun `afterRelight rallume et debite le prix de rallumage`() {
        val s = state(game(held = 5, flame = flame(canRelight = true, status = FlameStatus.Out)), meesh(balance = 5))
        val next = GameOptimistic.afterRelight(s)
        assertThat(next.game.flame.status).isEqualTo(FlameStatus.Lit)
        assertThat(next.game.flame.canRelight).isFalse()
        assertThat(next.game.flame.days).isEqualTo(s.game.flame.days)
        assertThat(next.meesh?.balance).isEqualTo(2)
        assertSynced(next)
    }

    @Test
    fun `afterRelight impossible rend la meme instance`() {
        val s = state()
        assertThat(GameOptimistic.afterRelight(s)).isSameInstanceAs(s)
    }

    @Test
    fun `withRelit pose la serie servie sa forme son bonus et le solde servi`() {
        val s = state(game(flame = flame(days = 0, canRelight = true, status = FlameStatus.Out)))
        val next = GameOptimistic.withRelit(s, streak = 31, balance = 4)
        assertThat(next.game.flame.days).isEqualTo(31)
        assertThat(next.game.flame.form).isEqualTo(FlameFormKey.Brasier)
        assertThat(next.game.flame.bonusPercent).isEqualTo(50)
        assertThat(next.game.flame.status).isEqualTo(FlameStatus.Lit)
        assertThat(next.meesh?.balance).isEqualTo(4)
        assertSynced(next)
    }

    @Test
    fun `withGuideSeen ajoute les cles nouvelles et rend la meme instance sans nouveaute`() {
        val s = state()
        assertThat(GameOptimistic.withGuideSeen(s, listOf("welcome"))).isSameInstanceAs(s)
        assertThat(GameOptimistic.withGuideSeen(s, listOf("welcome", "mint")).game.guideSeen)
            .containsExactly("welcome", "mint").inOrder()
    }

    @Test
    fun `sans solde Meesh les gestes bougent le tresor seul`() {
        val next = GameOptimistic.afterFreeze(state(game(held = 5), meesh = null))
        assertThat(next.meesh).isNull()
        assertThat(next.game.treasury.held).isEqualTo(4)
    }

    @Test
    fun `restaurer l instantane rend un etat egal a celui de depart`() {
        val s = state()
        val snapshot = s
        GameOptimistic.afterMint(s)
        assertThat(snapshot).isEqualTo(s)
    }

    @Test
    fun `le remplacement recopie chaque champ du bloc`() {
        val g = game()
        assertThat(g.replacing()).isEqualTo(g)
        assertThat(g.level.replacing()).isEqualTo(g.level)
        assertThat(meesh().replacing()).isEqualTo(meesh())
    }
}
