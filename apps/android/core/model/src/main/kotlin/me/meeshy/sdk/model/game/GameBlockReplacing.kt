package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import kotlin.math.max

/*
 * Les types du bloc `game` sont des valeurs IMMUABLES : une mise à jour optimiste en reconstruit une copie.
 * Ces extensions nomment ce qui change et recopient le reste par un constructeur EXHAUSTIF, jamais par `copy()` :
 * un champ ajouté au bloc fait ROUGIR la compilation ici au lieu d'être perdu en silence.
 * MIROIR de `GameBlock+Replacing.swift` (iOS).
 */

/**
 * Une valeur posée : distingue « ne pas toucher » (`null`) de « poser `null` » (`Put(null)`), là où iOS écrit `T??`.
 */
public class Put<out T>(public val value: T)

public fun GameLevel.replacing(
    level: Int? = null,
    tier: LevelTierKey? = null,
    score: Long? = null,
    floorScore: Long? = null,
    nextThreshold: Put<Long?>? = null,
    pointsToNext: Long? = null,
    progress: Double? = null,
    record: Int? = null,
    prestige: Int? = null,
    canPrestige: Boolean? = null,
    ladder: Put<GameLevelLadder?>? = null,
): GameLevel = GameLevel(
    level = level ?: this.level,
    tier = tier ?: this.tier,
    score = score ?: this.score,
    floorScore = floorScore ?: this.floorScore,
    nextThreshold = if (nextThreshold != null) nextThreshold.value else this.nextThreshold,
    pointsToNext = pointsToNext ?: this.pointsToNext,
    progress = progress ?: this.progress,
    record = record ?: this.record,
    prestige = prestige ?: this.prestige,
    canPrestige = canPrestige ?: this.canPrestige,
    ladder = if (ladder != null) ladder.value else this.ladder,
    sparks = sparks,
    sparksCycle = sparksCycle,
    sparksLifetime = sparksLifetime,
    levelMaxLifetime = levelMaxLifetime,
    sparksDebt = sparksDebt,
)

/**
 * LES NIVEAUX SUR LE FIL (#9688) : miroir de `levelOnTheWire` / `mintOnTheWire`
 * (`packages/shared/utils/game/level-wire.ts`) et de `GameLevelWire` (iOS) — UNE composition, que la passerelle sert
 * et que l'optimiste rejoue. Les champs d'hier gardent l'ANCIENNE loi (niveau borné à 100, dix paliers) ; la lecture
 * ouverte par le rang voyage dans `ladder`.
 */
public object GameLevelWire {

    /**
     * Le niveau lu sur un score en poche, sous le plafond que le rang ouvre et le palier des étapes ([steps], `null`
     * devant un serveur d'avant les étapes). [levelRecord] : le record OUVERT d'avant, qui ne redescend jamais.
     * [sparks] : les étincelles d'après le geste, servies deux fois avec le niveau max à vie ; absentes, le niveau
     * garde la forme d'hier.
     */
    public fun level(
        score: Long,
        levelCap: Int?,
        levelRecord: Int?,
        prestige: Int,
        steps: LevelStepFacts? = null,
        sparks: GameSparks.Ledger? = null,
        levelMaxLifetime: Int? = null,
        pastCycleRecords: List<Int>? = null,
    ): GameLevel {
        val gate = GameLevelSteps.gate(steps)
        val progress = GameLevels.progress(score, levelCap, gate)
        val legacy = GameLevels.legacyProgress(score, gate)
        val record = GameLevels.record(progress.level, levelRecord)
        val maxLifetime = sparks?.let { max(record, levelMaxLifetime ?: 0) }
        return GameLevel(
            level = legacy.level,
            tier = legacy.tier,
            score = legacy.score,
            floorScore = legacy.floorScore,
            nextThreshold = legacy.nextThreshold,
            pointsToNext = legacy.pointsToNext,
            progress = legacy.progress,
            record = GameLevels.legacyLevel(record),
            prestige = prestige,
            canPrestige = GameLevels.canPrestige(progress.level, prestige),
            ladder = GameLevelLadder(
                level = progress.level,
                tier = progress.tier,
                floorScore = progress.floorScore,
                nextThreshold = progress.nextThreshold,
                pointsToNext = progress.pointsToNext,
                progress = progress.progress,
                record = record,
                cap = progress.cap,
                isMax = progress.isMax,
                held = progress.held,
                step = GameLevelSteps.next(progress.level, steps),
                steps = steps?.let { GameLevelStepCounts(it.minted, it.missionsDone, it.flameRecord) },
                levelMaxLifetime = maxLifetime,
                pastCycleRecords = pastCycleRecords,
            ),
            sparks = sparks?.pocket,
            sparksCycle = sparks?.cycle,
            sparksLifetime = sparks?.lifetime,
            levelMaxLifetime = maxLifetime,
            sparksDebt = sparks?.debt,
        )
    }

    /** L'aperçu de frappe sur le fil : les niveaux d'hier bornés à 100, la lecture ouverte dans `ladder`. */
    public fun mint(preview: GameMintPreview): GameMintPreview {
        val before = GameLevels.legacyLevel(preview.levelBefore)
        val after = GameLevels.legacyLevel(preview.levelAfter)
        return GameMintPreview(
            number = preview.number,
            price = preview.price,
            edition = preview.edition,
            canMint = preview.canMint,
            missingPoints = preview.missingPoints,
            levelBefore = before,
            levelAfter = after,
            levelsLost = max(0, before - after),
            gloryGained = preview.gloryGained,
            ladder = GameMintLadder(preview.levelBefore, preview.levelAfter, preview.levelsLost),
            basePrice = preview.basePrice,
            costFactor = preview.costFactor,
            costLevel = preview.costLevel,
            locked = preview.locked,
            sparksDebt = preview.sparksDebt,
            blockedBy = preview.blockedBy,
        )
    }
}

/**
 * Le trésor à [held] Meeshes gardées. Les réserves suivent la loi partagée sur la Gloire DU BLOC ; un serveur d'avant
 * les réserves n'en sert pas, et rien ne s'invente.
 */
public fun GameBlock.treasuryAt(held: Int): TreasuryStanding {
    val standing = GameTreasury.standing(max(0, held))
    return TreasuryStanding(
        held = standing.held,
        tier = standing.tier,
        next = standing.next,
        access = treasury.access?.let { GameTreasury.reserveAccess(glory.glory, glory.rank == GloryRank.Mythe) },
    )
}

public fun GameGlory.atGlory(newGlory: Int): GameGlory {
    val standing = GloryLaws.standing(newGlory, mythic = rank == GloryRank.Mythe, mythicSeat = mythicSeat)
    return GameGlory(
        glory = standing.glory,
        rank = standing.rank,
        division = standing.division,
        division5 = standing.division5,
        next = standing.next,
        gloryMissing = standing.gloryMissing,
        progress = standing.progress,
        mythic = if (rank == GloryRank.Mythe) mythic else null,
    )
}

public fun GameMissions.replacing(
    items: List<GameMission>? = null,
    rerollAvailable: Boolean? = null,
): GameMissions = GameMissions(
    dayKey = dayKey,
    prismDay = prismDay,
    unlocked = unlocked,
    items = items ?: this.items,
    rerollAvailable = rerollAvailable ?: this.rerollAvailable,
    personal = personal,
)

public fun GameChest.replacing(status: ChestStatus? = null, reward: Put<DailyChest?>? = null): GameChest = GameChest(
    status = status ?: this.status,
    odds = odds,
    reward = if (reward != null) reward.value else this.reward,
    today = today,
)

public fun GameFlame.replacing(
    days: Int? = null,
    form: Put<FlameFormKey?>? = null,
    bonusPercent: Int? = null,
    freezes: Int? = null,
    status: FlameStatus? = null,
    canRelight: Boolean? = null,
): GameFlame = GameFlame(
    days = days ?: this.days,
    form = if (form != null) form.value else this.form,
    bonusPercent = bonusPercent ?: this.bonusPercent,
    freezes = freezes ?: this.freezes,
    maxFreezes = maxFreezes,
    freezePrice = freezePrice,
    relightPrice = relightPrice,
    status = status ?: this.status,
    canRelight = canRelight ?: this.canRelight,
)

public fun GameBoosts.replacing(tailwind: Double? = null): GameBoosts =
    GameBoosts(tailwind = tailwind ?: this.tailwind, prismHour = prismHour)

public fun GameBlock.replacing(
    level: GameLevel? = null,
    glory: GameGlory? = null,
    treasury: TreasuryStanding? = null,
    mint: GameMintPreview? = null,
    missions: GameMissions? = null,
    chest: GameChest? = null,
    flame: GameFlame? = null,
    boosts: GameBoosts? = null,
    guideSeen: List<String>? = null,
    starFragments: Put<StarFragmentsTotal?>? = null,
    wave2: GameWave2? = null,
): GameBlock = GameBlock(
    level = level ?: this.level,
    glory = glory ?: this.glory,
    treasury = treasury ?: this.treasury,
    mint = mint ?: this.mint,
    missions = missions ?: this.missions,
    chest = chest ?: this.chest,
    flame = flame ?: this.flame,
    boosts = boosts ?: this.boosts,
    guideSeen = guideSeen ?: this.guideSeen,
    starFragments = if (starFragments != null) starFragments.value else this.starFragments,
    league = if (wave2 != null) wave2.league else league,
    duo = if (wave2 != null) wave2.duo else duo,
    season = if (wave2 != null) wave2.season else season,
    seasonUpcoming = if (wave2 != null) wave2.seasonUpcoming else seasonUpcoming,
    trophies = if (wave2 != null) wave2.trophies else trophies,
    atlas = if (wave2 != null) wave2.atlas else atlas,
    prestige = if (wave2 != null) wave2.prestige else prestige,
    visibility = if (wave2 != null) wave2.visibility else visibility,
    achievementRarities = if (wave2 != null) wave2.achievementRarities else achievementRarities,
)

public fun ApiEngagementProgress.Meesh.replacing(
    balance: Int? = null,
    mintedLifetime: Int? = null,
    debitablePoints: Int? = null,
    missingPoints: Int? = null,
    mintCost: Int? = null,
): ApiEngagementProgress.Meesh = ApiEngagementProgress.Meesh(
    balance = balance ?: this.balance,
    mintedLifetime = mintedLifetime ?: this.mintedLifetime,
    debitablePoints = debitablePoints ?: this.debitablePoints,
    floorPoints = floorPoints,
    missingPoints = missingPoints ?: this.missingPoints,
    mintCost = mintCost ?: this.mintCost,
    firstMintedAt = firstMintedAt,
    lastMintedAt = lastMintedAt,
    baseMintCost = baseMintCost,
    costFactor = costFactor,
    sparksDebt = sparksDebt,
    blockedBy = blockedBy,
)

/** La même charge, avec un autre bloc `game` et un autre solde (`null` = inchangé). */
public fun ApiEngagementProgress.replacing(
    game: GameBlock? = null,
    meesh: ApiEngagementProgress.Meesh? = null,
): ApiEngagementProgress = ApiEngagementProgress(
    counters = counters,
    milestones = milestones,
    streak = streak,
    level = level,
    meesh = meesh ?: this.meesh,
    elan = elan,
    achievementReach = achievementReach,
    game = game ?: this.game,
    gameRevision = gameRevision,
)
