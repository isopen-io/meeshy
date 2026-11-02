package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementCatalog
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/**
 * LES TÊTES SANS BLOC DE JEU (iOS `ProgressionLevelHero`, `ProgressionMeeshDetail`, #13923) : sans jeu servi, la fiche
 * du Niveau dit « Niveau N », les étincelles, la barre et ce qui sépare du suivant ; celle de la Meesh dit le solde, les
 * frappées depuis toujours, les deux bornes du registre, la barre, puis la frappe ou ce qu'il manque. Ces têtes tiennent
 * la tête de la fiche comme iOS (`isHero` = `exist`) : le Niveau toujours, la Meesh dès qu'un jeu OU un portefeuille
 * est servi.
 */
class ProgressionHeadsWithoutGameTest {

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(score: Int = 0, meesh: ApiEngagementProgress.Meesh? = null, game: GameBlock? = null): EngagementProgress =
        EngagementProgressResolver.resolve(
            ApiEngagementProgress.empty.copy(level = ApiEngagementProgress.Level(engagementScore = score), meesh = meesh, game = game),
        )

    private fun wallet(
        balance: Int = 3,
        minted: Int = 5,
        debitable: Int = 400,
        floor: Int = 0,
        missing: Int = 600,
        cost: Int = 1000,
        first: String? = null,
        last: String? = null,
    ) = ApiEngagementProgress.Meesh(
        balance = balance, mintedLifetime = minted, debitablePoints = debitable, floorPoints = floor,
        missingPoints = missing, mintCost = cost, firstMintedAt = first, lastMintedAt = last,
    )

    @Test
    fun `the level hero says the level, the sparks, the bar and what separates from the next level`() {
        val served = progress(score = 350)
        val hero = ProgressionLevelHero.of(served.level)
        val scale = served.level.scale
        assertThat(hero.level).isEqualTo(served.level.level)
        assertThat(hero.score).isEqualTo(350)
        assertThat(hero.progress).isEqualTo(scale.progress)
        assertThat(hero.next).isEqualTo(ProgressionLevelHero.Next(remaining = checkNotNull(scale.remainingToNext), level = served.level.level + 1))
    }

    @Test
    fun `at the top of the scale the level hero says the scale is complete`() {
        val top = progress(score = EngagementCatalog.levelThresholds.last() + 10)
        assertThat(ProgressionLevelHero.of(top.level).next).isNull()
    }

    @Test
    fun `the meesh detail says the balance, the struck ones, the two bounds and the mint`() {
        val served = progress(meesh = wallet(debitable = 1200, missing = 0, first = "2026-09-01T10:00:00Z", last = "2026-10-20T08:30:00Z"))
        val detail = ProgressionMeeshDetail.of(checkNotNull(served.meesh))
        assertThat(detail.balance).isEqualTo(3)
        assertThat(detail.minted).isEqualTo(5)
        assertThat(detail.first).isEqualTo("2026-09-01T10:00:00Z")
        assertThat(detail.last).isEqualTo("2026-10-20T08:30:00Z")
        assertThat(detail.progress).isEqualTo(1.0)
        assertThat(detail.action).isEqualTo(MeeshAction.Mint(cost = 1000))
    }

    @Test
    fun `a single mint says its date once and nothing struck says no bound`() {
        val once = ProgressionMeeshDetail.of(
            checkNotNull(progress(meesh = wallet(minted = 1, first = "2026-10-20T08:30:00Z", last = "2026-10-20T08:30:00.000Z")).meesh),
        )
        assertThat(once.first).isEqualTo("2026-10-20T08:30:00Z")
        assertThat(once.last).isNull()
        val never = ProgressionMeeshDetail.of(checkNotNull(progress(meesh = wallet(balance = 0, minted = 0)).meesh))
        assertThat(never.minted).isNull()
        assertThat(never.first).isNull()
        assertThat(never.last).isNull()
        assertThat(never.balance).isEqualTo(0)
    }

    @Test
    fun `without enough sparks the detail says what is missing and the conversation floor`() {
        val detail = ProgressionMeeshDetail.of(checkNotNull(progress(meesh = wallet(debitable = 400, missing = 600, floor = 120)).meesh))
        assertThat(detail.action).isEqualTo(MeeshAction.Missing(missing = 600, floor = 120))
        assertThat(detail.progress).isEqualTo(0.4)
    }

    @Test
    fun `the level hero holds the head without a game block and the fiche then has no line`() {
        val bare = progress(score = 350)
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Level, bare, null)).isTrue()
        val fiche = ProgressionConceptFiches.make(
            ProgressionConcept.Level, bare, null, 0L, SeasonMoment("2026-10-20", 600),
            pieceIsHero = ProgressionConceptPieces.isHero(ProgressionConcept.Level, bare, null),
        )
        assertThat(fiche.head).isEqualTo(FicheHead.Piece)
        assertThat(fiche.hasWhere).isFalse()
    }

    @Test
    fun `the meesh detail holds the head with a wallet and without a game block, like iOS exist`() {
        val withWallet = progress(meesh = wallet())
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Meesh, withWallet, null)).isTrue()
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Meesh, progress(), null)).isFalse()
        val block = game()
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Meesh, progress(game = block), block)).isTrue()
        val fiche = ProgressionConceptFiches.make(
            ProgressionConcept.Meesh, withWallet, null, 0L, SeasonMoment("2026-10-20", 600),
            pieceIsHero = ProgressionConceptPieces.isHero(ProgressionConcept.Meesh, withWallet, null),
        )
        assertThat(fiche.head).isEqualTo(FicheHead.Piece)
        assertThat(fiche.hasWhere).isFalse()
    }
}
