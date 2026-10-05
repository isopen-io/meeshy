import Foundation
import MeeshySDK

/// UN BLOC `game` COHÉRENT, bâti par la loi elle-même (jamais écrit à la main) :
/// niveau, rang, trésor et aperçu de frappe se déduisent des mêmes faits que ceux
/// que la passerelle sert. Chaque témoin décrit l'état qu'il veut par quelques
/// paramètres nommés.
enum GameFixture {

    static func mission(
        id: String = "m1", templateKey: String = "send-texts", difficulty: MissionDifficulty = .easy,
        target: Int = 5, progress: Int = 0, reward: Int = 30, completed: Bool = false
    ) -> GameBlock.Mission {
        GameBlock.Mission(
            id: id, templateKey: templateKey, difficulty: difficulty,
            signal: MissionSignal("axis:content.text_message"), prism: false, target: target,
            progress: progress, reward: reward, glory: 0,
            completedAt: completed ? "2026-10-05T08:00:00.000Z" : nil
        )
    }

    static func game(
        score: Int = 12_180,
        levelRecord: Int? = nil,
        glory: Int = 1_730,
        mythic: Bool = false,
        minted: Int = 12,
        debitable: Int? = nil,
        held: Int = 9,
        flameDays: Int = 23,
        flameStatus: FlameStatus = .lit,
        freezes: Int = 0,
        canRelight: Bool = false,
        missions: [GameBlock.Mission]? = nil,
        rerollAvailable: Bool = true,
        chestStatus: GameBlock.Chest.Status = .locked,
        chestReward: DailyChest? = nil,
        guideSeen: [String] = []
    ) -> GameBlock {
        let levelState = GameLevels.progress(forScore: score)
        let record = max(levelRecord ?? levelState.level, levelState.level)
        let standing = GameGlory.standing(glory: glory, mythic: mythic)
        let items = missions ?? [mission(id: "m1"), mission(id: "m2", templateKey: "reply-conversations", difficulty: .medium, target: 3, reward: 60), mission(id: "m3", templateKey: "publish-post", difficulty: .hard, target: 2, reward: 120)]
        return GameBlock(
            level: GameBlock.Level(
                level: levelState.level, tier: levelState.tier, score: levelState.score, floorScore: levelState.floorScore,
                nextThreshold: levelState.nextThreshold, pointsToNext: levelState.pointsToNext, progress: levelState.progress,
                record: record, prestige: 0, canPrestige: GameLevels.canPrestige(level: levelState.level, prestige: 0)
            ),
            glory: GameBlock.Glory(
                glory: standing.glory, rank: standing.rank, division: standing.division, next: standing.next,
                gloryMissing: standing.gloryMissing, progress: standing.progress
            ),
            treasury: GameTreasury.standing(held: held),
            mint: GameMint.preview(score: score, mintedLifetime: minted, debitablePoints: debitable ?? score),
            missions: GameBlock.Missions(dayKey: "2026-10-05", prismDay: false, unlocked: levelState.level >= 5, items: items, rerollAvailable: rerollAvailable),
            chest: GameBlock.Chest(status: chestStatus, odds: GameChest.odds, reward: chestReward),
            flame: GameBlock.Flame(
                days: flameDays, form: GameFlame.form(forDays: flameDays), bonusPercent: GameFlame.bonusPercent(forDays: flameDays),
                freezes: freezes, maxFreezes: 2, freezePrice: 1, relightPrice: 3, status: flameStatus, canRelight: canRelight
            ),
            boosts: GameBlock.Boosts(tailwind: GameBoosts.tailwind(level: levelState.level, levelRecord: record), prismHour: nil),
            guideSeen: guideSeen
        )
    }

    /// Le solde, lu à l'endroit où l'écran le lit en second.
    static func meesh(balance: Int = 9, minted: Int = 12, debitable: Int = 12_180, cost: Int? = nil) -> APIEngagementProgress.Meesh {
        let price = cost ?? GameMint.price(forNumber: minted + 1)
        return APIEngagementProgress.Meesh(
            balance: balance, mintedLifetime: minted, debitablePoints: debitable, floorPoints: 0,
            missingPoints: max(0, price - debitable), mintCost: price
        )
    }

    static func state(_ game: GameBlock = game(), meesh: APIEngagementProgress.Meesh? = meesh()) -> GameState {
        GameState(game: game, meesh: meesh)
    }

    static func snapshot(_ game: GameBlock = game(), meesh: APIEngagementProgress.Meesh? = meesh()) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [.init(axisKey: "content.text_message", count: 12)],
            milestones: [],
            streak: .init(currentStreakDays: 1, longestStreakDays: 1),
            level: .init(engagementScore: game.level.score),
            meesh: meesh,
            game: game
        )
    }
}

/// Une valeur lue PENDANT un geste, depuis une fermeture que le double appelle.
final class Probe<Value>: @unchecked Sendable {
    var value: Value?
}
