package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress

internal object GameOptimisticFixtures {

    fun glory(points: Int = 5_000): GameGlory {
        val s = GloryLaws.standing(points)
        return GameGlory(s.glory, s.rank, s.division, s.division5, s.next, s.gloryMissing, s.progress, null)
    }

    fun mission(id: String = "m1"): GameMission = GameMission(
        id = id, templateKey = "send-messages", difficulty = MissionDifficulty.Easy, signal = "message",
        prism = false, target = 3, progress = 1, reward = 300, glory = 10,
    )

    fun flame(days: Int = 8, freezes: Int = 1, canRelight: Boolean = false, status: FlameStatus = FlameStatus.Lit) = GameFlame(
        days = days, form = GameFlameLaw.form(days), bonusPercent = GameFlameLaw.bonusPercent(days), freezes = freezes,
        maxFreezes = 2, freezePrice = 1, relightPrice = 3, status = status, canRelight = canRelight,
    )

    fun chest(status: ChestStatus = ChestStatus.Ready) = GameChest(
        status = status,
        odds = ChestOdds(minPoints = 500, maxPoints = 10_000, fragment = 0.16, freeze = 0.05),
    )

    /** Un bloc complet, construit par les lois : [sparks] présent, il sert la poche (serveur des étincelles). */
    fun game(
        score: Long = 40_000,
        held: Int = 9,
        minted: Int = 12,
        sparks: Boolean = false,
        gloryPoints: Int = 5_000,
        rerollAvailable: Boolean = true,
        flame: GameFlame = flame(),
        chestStatus: ChestStatus = ChestStatus.Ready,
    ): GameBlock {
        val glory = glory(gloryPoints)
        val cap = GloryLaws.levelCap(glory.rank)
        val ledger = if (sparks) GameSparks.Ledger(score, score + 500, score + 900, 0L) else null
        val level = GameLevelWire.level(score, cap, null, 0, sparks = ledger, levelMaxLifetime = if (sparks) 10 else null)
        val preview = GameLevelWire.mint(
            if (sparks) {
                GameMint.sparksPreview(score, minted, held, glory.glory, cap, null)
            } else {
                GameMint.preview(score, minted, score, cap, null)
            },
        )
        return GameBlock(
            level = level,
            glory = glory,
            treasury = GameTreasury.standing(held).copy(access = GameTreasury.reserveAccess(glory.glory)),
            mint = preview,
            missions = GameMissions("2026-10-20", false, true, listOf(mission("m1"), mission("m2")), rerollAvailable),
            chest = chest(chestStatus),
            flame = flame,
            boosts = GameBoosts(1.0),
            guideSeen = listOf("welcome"),
            starFragments = StarFragmentsTotal(4),
        )
    }

    fun meesh(balance: Int = 9, minted: Int = 12, debitable: Int = 40_000) = ApiEngagementProgress.Meesh(
        balance = balance, mintedLifetime = minted, debitablePoints = debitable, floorPoints = 0,
        missingPoints = 0, mintCost = 1221,
    )

    fun state(game: GameBlock = game(), meesh: ApiEngagementProgress.Meesh? = meesh()) = GameState(game, meesh)
}
