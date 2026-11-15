package me.meeshy.sdk.model.game.guide

import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey

/** Des parties de jeu pour les témoins du guide, bâties sur la charge servie de référence. */
internal object GuideTestGames {

    val onboardingDone: List<String> = GameGuide.onboardingSteps.map { GameGuide.onboardingSeenKey(it.key) }

    private fun served(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    /** Un débutant : niveau 1, Murmure, aucun trésor, rêve fermé, Flamme allumée, première Meesh pas encore frappable. */
    fun beginner(seen: List<String> = emptyList()): GameBlock {
        val game = served()
        return game.copy(
            level = game.level.copy(
                level = 1, tier = LevelTierKey.Etincelle, pointsToNext = 40, nextThreshold = 50, prestige = 0,
                canPrestige = false, ladder = null,
            ),
            glory = game.glory.copy(rank = GloryRank.Murmure, division = null, division5 = null, gloryMissing = 100),
            treasury = game.treasury.copy(held = 0, tier = null, next = null),
            mint = game.mint.copy(number = 1, canMint = false, price = 1000),
            missions = game.missions.copy(unlocked = false),
            flame = game.flame.copy(status = FlameStatus.Lit),
            guideSeen = seen,
            league = null,
            season = null,
            trophies = null,
            atlas = null,
        )
    }

    fun atLevel(game: GameBlock, level: Int, tier: LevelTierKey = game.level.tier): GameBlock =
        game.copy(level = game.level.copy(level = level, tier = tier, ladder = null))

    fun withRank(game: GameBlock, rank: GloryRank, division5: Int?): GameBlock =
        game.copy(glory = game.glory.copy(rank = rank, division5 = division5, division = null))

    fun withFlame(game: GameBlock, status: FlameStatus, days: Int = 8): GameBlock =
        game.copy(flame = game.flame.copy(status = status, days = days))
}

/** Les deux magasins de l'appareil, en mémoire. */
internal class FakeGuideMemory(var lastVisit: String? = null, var snapshot: GuideSnapshot? = null) :
    GuideVisitStore, GuideSnapshotStore {
    override fun lastVisitDay(): String? = lastVisit
    override fun rememberVisit(day: String) {
        lastVisit = day
    }

    override fun load(): GuideSnapshot? = snapshot
    override fun save(snapshot: GuideSnapshot) {
        this.snapshot = snapshot
    }
}
