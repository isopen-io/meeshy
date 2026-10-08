import Foundation
@testable import Meeshy
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
        score: Int = 121_800,
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
        guideSeen: [String] = [],
        servesLadder: Bool = true,
        steps: GameLevelStepCounts? = nil
    ) -> GameBlock {
        let standing = GameGlory.standing(glory: glory, mythic: mythic)
        // Le niveau et la frappe tels que la passerelle les sert (#9688) : champs d'hier sous l'ancienne loi, la
        // lecture ouverte par le rang dans `ladder` — ou, `servesLadder: false`, tels qu'un serveur antérieur.
        let levelCap = GameGlory.levelCap(forRank: standing.rank)
        // Les étapes des niveaux (#9706), jugées avec la Gloire et le rang du témoin ; `nil` : un serveur d'avant les étapes.
        let stepFacts = steps.map { GameLevelStepFacts(counts: $0, glory: standing.glory, rank: standing.rank) }
        let served = GameLevelWire.level(score: score, levelCap: levelCap, levelRecord: levelRecord, prestige: 0, steps: stepFacts)
        let level = servesLadder ? served : served.replacing(ladder: .some(nil))
        let shown = level.shown
        let wireMint = GameLevelWire.mint(
            GameMint.preview(score: score, mintedLifetime: minted, debitablePoints: debitable ?? score, levelCap: levelCap)
        )
        let mint = servesLadder ? wireMint : GameMintPreview(
            number: wireMint.number, price: wireMint.price, edition: wireMint.edition, canMint: wireMint.canMint,
            missingPoints: wireMint.missingPoints, levelBefore: wireMint.levelBefore, levelAfter: wireMint.levelAfter,
            levelsLost: wireMint.levelsLost, gloryGained: wireMint.gloryGained
        )
        let items = missions ?? [mission(id: "m1"), mission(id: "m2", templateKey: "reply-conversations", difficulty: .medium, target: 3, reward: 60), mission(id: "m3", templateKey: "publish-post", difficulty: .hard, target: 2, reward: 120)]
        return GameBlock(
            level: level,
            glory: GameBlock.Glory(
                glory: standing.glory, rank: standing.rank, division: standing.division, division5: standing.division5,
                next: standing.next, gloryMissing: standing.gloryMissing, progress: standing.progress
            ),
            treasury: GameTreasury.standing(held: held),
            mint: mint,
            missions: GameBlock.Missions(dayKey: "2026-10-05", prismDay: false, unlocked: shown.level >= 5, items: items, rerollAvailable: rerollAvailable),
            chest: GameBlock.Chest(status: chestStatus, odds: GameChest.odds, reward: chestReward),
            flame: GameBlock.Flame(
                days: flameDays, form: GameFlame.form(forDays: flameDays), bonusPercent: GameFlame.bonusPercent(forDays: flameDays),
                freezes: freezes, maxFreezes: 2, freezePrice: 1, relightPrice: 3, status: flameStatus, canRelight: canRelight
            ),
            boosts: GameBlock.Boosts(tailwind: GameBoosts.tailwind(level: shown.level, levelRecord: shown.record), prismHour: nil),
            guideSeen: guideSeen
        )
    }

    /// Le solde, lu à l'endroit où l'écran le lit en second.
    static func meesh(balance: Int = 9, minted: Int = 12, debitable: Int = 121_800, cost: Int? = nil) -> APIEngagementProgress.Meesh {
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
