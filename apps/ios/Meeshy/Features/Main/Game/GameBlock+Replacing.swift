import Foundation
import MeeshySDK

// Les types du bloc `game` sont des valeurs IMMUABLES (`let`) : une mise à jour
// optimiste en reconstruit une copie. Ces extensions nomment ce qui change et
// recopient le reste — un champ ajouté au bloc fait ROUGIR la compilation ici
// (l'initialiseur est exhaustif) au lieu d'être perdu en silence.

extension GameBlock.Level {
    func replacing(
        level: Int? = nil,
        tier: LevelTierKey? = nil,
        score: Int? = nil,
        floorScore: Int? = nil,
        nextThreshold: Int?? = nil,
        pointsToNext: Int? = nil,
        progress: Double? = nil,
        record: Int? = nil,
        prestige: Int? = nil,
        canPrestige: Bool? = nil,
        ladder: Ladder?? = nil
    ) -> GameBlock.Level {
        GameBlock.Level(
            level: level ?? self.level,
            tier: tier ?? self.tier,
            score: score ?? self.score,
            floorScore: floorScore ?? self.floorScore,
            nextThreshold: nextThreshold ?? self.nextThreshold,
            pointsToNext: pointsToNext ?? self.pointsToNext,
            progress: progress ?? self.progress,
            record: record ?? self.record,
            prestige: prestige ?? self.prestige,
            canPrestige: canPrestige ?? self.canPrestige,
            ladder: ladder ?? self.ladder
        )
    }
}

/// LES NIVEAUX SUR LE FIL (#9688) — miroir de `levelOnTheWire` / `mintOnTheWire`
/// (`packages/shared/utils/game/level-wire.ts`) : UNE composition, que la passerelle sert et que l'optimiste
/// rejoue. Les champs d'hier gardent l'ANCIENNE loi (niveau borné à 100, dix paliers) ; la lecture ouverte par
/// le rang voyage dans `ladder`. L'écran ne lit que `ladder` (`level.shown`, `mint.shownLevels`).
/// `nonisolated` : une loi pure, que les fixtures de test (non isolées) rejouent aussi.
nonisolated enum GameLevelWire {

    /// Le niveau lu sur un score en poche, sous le plafond que le rang ouvre (`GameGlory.levelCap(forRank:)`)
    /// et le palier des étapes (#9706, `steps` — `nil` devant un serveur d'avant les étapes : rien ne retient).
    /// `levelRecord` : le record OUVERT d'avant (`level.shown.record`) — il ne redescend jamais.
    static func level(score: Int, levelCap: Int?, levelRecord: Int?, prestige: Int,
                      steps: GameLevelStepFacts? = nil) -> GameBlock.Level {
        let gate = GameLevelSteps.gate(steps)
        let progress = GameLevels.progress(forScore: score, cap: levelCap, gate: gate)
        let legacy = GameLevels.legacyProgress(forScore: score, gate: gate)
        let record = GameLevels.record(level: progress.level, previousRecord: levelRecord)
        return GameBlock.Level(
            level: legacy.level,
            tier: legacy.tier,
            score: legacy.score,
            floorScore: legacy.floorScore,
            nextThreshold: legacy.nextThreshold,
            pointsToNext: legacy.pointsToNext,
            progress: legacy.progress,
            record: GameLevels.legacyLevel(record),
            prestige: prestige,
            canPrestige: GameLevels.canPrestige(level: progress.level, prestige: prestige),
            ladder: GameBlock.Level.Ladder(
                level: progress.level,
                tier: progress.tier,
                floorScore: progress.floorScore,
                nextThreshold: progress.nextThreshold,
                pointsToNext: progress.pointsToNext,
                progress: progress.progress,
                record: record,
                cap: progress.cap,
                isMax: progress.isMax,
                held: progress.held,
                step: GameLevelSteps.next(after: progress.level, facts: steps),
                steps: steps?.counts
            )
        )
    }

    /// L'aperçu de frappe sur le fil : les niveaux d'hier bornés à 100, la lecture ouverte dans `ladder`.
    /// `preview` vient de `GameMint.preview(…, levelCap:)`, qui lit les niveaux sous le plafond du rang.
    static func mint(_ preview: GameMintPreview) -> GameMintPreview {
        let before = GameLevels.legacyLevel(preview.levelBefore)
        let after = GameLevels.legacyLevel(preview.levelAfter)
        return GameMintPreview(
            number: preview.number,
            price: preview.price,
            edition: preview.edition,
            canMint: preview.canMint,
            missingPoints: preview.missingPoints,
            levelBefore: before,
            levelAfter: after,
            levelsLost: max(0, before - after),
            gloryGained: preview.gloryGained,
            ladder: GameMintLadder(levelBefore: preview.levelBefore, levelAfter: preview.levelAfter, levelsLost: preview.levelsLost)
        )
    }
}

extension GameBlock {
    /// Les faits des étapes que le serveur a servis (#9706) — les compteurs de `ladder.steps`, la Gloire et le
    /// rang du bloc ; `nil` devant un serveur d'avant les étapes.
    nonisolated var levelStepFacts: GameLevelStepFacts? {
        level.ladder?.steps.map { GameLevelStepFacts(counts: $0, glory: glory.glory, rank: glory.rank) }
    }
}

extension GameBlock.Glory {
    func atGlory(_ newGlory: Int) -> GameBlock.Glory {
        let standing = GameGlory.standing(glory: newGlory, mythic: rank == .mythe, mythicSeat: mythicSeat)
        return GameBlock.Glory(
            glory: standing.glory,
            rank: standing.rank,
            division: standing.division,
            division5: standing.division5,
            next: standing.next,
            gloryMissing: standing.gloryMissing,
            progress: standing.progress,
            mythic: rank == .mythe ? mythic : nil
        )
    }
}

extension GameBlock.Missions {
    func replacing(items: [GameBlock.Mission]? = nil, rerollAvailable: Bool? = nil) -> GameBlock.Missions {
        GameBlock.Missions(
            dayKey: dayKey,
            prismDay: prismDay,
            unlocked: unlocked,
            items: items ?? self.items,
            rerollAvailable: rerollAvailable ?? self.rerollAvailable,
            personal: personal
        )
    }
}

extension GameBlock.Chest {
    func replacing(status: Status? = nil, reward: DailyChest?? = nil) -> GameBlock.Chest {
        GameBlock.Chest(status: status ?? self.status, odds: odds, reward: reward ?? self.reward)
    }
}

extension GameBlock.Flame {
    func replacing(
        days: Int? = nil,
        form: FlameFormKey?? = nil,
        bonusPercent: Int? = nil,
        freezes: Int? = nil,
        status: FlameStatus? = nil,
        canRelight: Bool? = nil
    ) -> GameBlock.Flame {
        GameBlock.Flame(
            days: days ?? self.days,
            form: form ?? self.form,
            bonusPercent: bonusPercent ?? self.bonusPercent,
            freezes: freezes ?? self.freezes,
            maxFreezes: maxFreezes,
            freezePrice: freezePrice,
            relightPrice: relightPrice,
            status: status ?? self.status,
            canRelight: canRelight ?? self.canRelight
        )
    }
}

extension GameBlock.Boosts {
    func replacing(tailwind: Double? = nil) -> GameBlock.Boosts {
        GameBlock.Boosts(tailwind: tailwind ?? self.tailwind, prismHour: prismHour)
    }
}

extension GameBlock {
    func replacing(
        level: Level? = nil,
        glory: Glory? = nil,
        treasury: TreasuryStanding? = nil,
        mint: GameMintPreview? = nil,
        missions: Missions? = nil,
        chest: Chest? = nil,
        flame: Flame? = nil,
        boosts: Boosts? = nil,
        guideSeen: [String]? = nil,
        wave2: GameWave2? = nil
    ) -> GameBlock {
        GameBlock(
            level: level ?? self.level,
            glory: glory ?? self.glory,
            treasury: treasury ?? self.treasury,
            mint: mint ?? self.mint,
            missions: missions ?? self.missions,
            chest: chest ?? self.chest,
            flame: flame ?? self.flame,
            boosts: boosts ?? self.boosts,
            guideSeen: guideSeen ?? self.guideSeen,
            wave2: wave2 ?? self.wave2
        )
    }
}

extension APIEngagementProgress.Meesh {
    func replacing(
        balance: Int? = nil,
        mintedLifetime: Int? = nil,
        debitablePoints: Int? = nil,
        missingPoints: Int? = nil,
        mintCost: Int? = nil
    ) -> APIEngagementProgress.Meesh {
        APIEngagementProgress.Meesh(
            balance: balance ?? self.balance,
            mintedLifetime: mintedLifetime ?? self.mintedLifetime,
            debitablePoints: debitablePoints ?? self.debitablePoints,
            floorPoints: floorPoints,
            missingPoints: missingPoints ?? self.missingPoints,
            mintCost: mintCost ?? self.mintCost,
            firstMintedAt: firstMintedAt,
            lastMintedAt: lastMintedAt
        )
    }
}

extension APIEngagementProgress {
    /// La même charge, avec un autre bloc `game` et un autre solde (`nil` = inchangé).
    func replacing(game: GameBlock? = nil, meesh: Meesh? = nil) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: counters,
            milestones: milestones,
            streak: streak,
            level: level,
            meesh: meesh ?? self.meesh,
            elan: elan,
            achievementReach: achievementReach,
            game: game ?? self.game
        )
    }
}
