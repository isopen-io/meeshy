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
        canPrestige: Bool? = nil
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
            prestige: prestige,
            canPrestige: canPrestige ?? self.canPrestige
        )
    }

    /// Le niveau lu sur un nouveau score en poche — la MÊME loi que la passerelle.
    func atScore(_ newScore: Int) -> GameBlock.Level {
        let lawful = GameLevels.progress(forScore: max(0, newScore))
        return replacing(
            level: lawful.level,
            tier: lawful.tier,
            score: lawful.score,
            floorScore: lawful.floorScore,
            nextThreshold: .some(lawful.nextThreshold),
            pointsToNext: lawful.pointsToNext,
            progress: lawful.progress
        )
    }
}

extension GameBlock.Glory {
    func atGlory(_ newGlory: Int) -> GameBlock.Glory {
        let standing = GameGlory.standing(glory: newGlory, mythic: rank == .mythe)
        return GameBlock.Glory(
            glory: standing.glory,
            rank: standing.rank,
            division: standing.division,
            next: standing.next,
            gloryMissing: standing.gloryMissing,
            progress: standing.progress
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
            rerollAvailable: rerollAvailable ?? self.rerollAvailable
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
