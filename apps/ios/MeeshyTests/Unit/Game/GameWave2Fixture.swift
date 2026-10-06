import Foundation
@testable import Meeshy
import MeeshySDK

/// Les extensions de la vague 2, construites par les LOIS (jamais écrites à la main quand une loi les produit).
enum GameWave2Fixture {

    static func league(
        access: LeagueAccess = .open, pseudonym: String? = "Colibri-0001",
        current: GameLeagueBlock.Current? = .init(league: .jade, groupId: "2026-10-12:jade:1", groupSize: 12, rank: 4,
                                                  weekPoints: 410, zone: .promotion, cup: nil, pointsToPromotion: 0)
    ) -> GameLeagueBlock {
        GameLeagueBlock(
            unlocked: access != .locked, access: access, pseudonym: pseudonym, weekKey: "2026-10-12",
            closes: .init(dayKey: "2026-10-18", minuteOfDay: 1200), current: current,
            friends: .init(rank: 2, size: 3, weekPoints: 410)
        )
    }

    static func duo(
        status: DuoBlockStatus = .none, role: DuoActor? = nil, duoId: String? = nil, unlocked: Bool = true
    ) -> GameDuoBlock {
        GameDuoBlock(
            unlocked: unlocked, status: status, duoId: duoId, weekKey: "2026-10-12", role: role,
            partner: status == .none ? nil : .init(userId: "f1", displayName: "Ana"),
            mission: status == .active ? .init(templateKey: "duo-messages", signal: "axis:content.text_message", prism: false, partTarget: 52, commonTarget: 104) : nil,
            progress: status == .active ? .init(mine: 30, partner: 52, common: 82, mineDone: false, partnerDone: true, bothDone: false) : nil,
            reward: status == .active ? .init(points: 0, doubled: false) : nil
        )
    }

    static func season(steps: Int = 4, claimed: [Int] = [1, 2], sealOwned: Bool = false) -> GameSeasonBlock {
        let progress = GameSeason.progress(stars: steps * GameSeason.starsPerStep + 2)
        let next = (1...GameSeason.steps).first { $0 <= steps && !claimed.contains($0) }
        return GameSeasonBlock(
            number: 1, themeKey: "language:fr", startDay: "2026-10-12", endDay: "2026-12-06", week: 1,
            stars: progress.stars, steps: progress.steps, stepsTotal: GameSeason.steps, starsToNext: progress.starsToNext,
            progress: progress.progress, completed: false, claimedSteps: claimed,
            nextReward: next.flatMap { step in
                GameSeason.stepReward(step).map { GameSeasonBlock.NextReward(step: step, reward: .init(kind: $0.kind, amount: $0.amount)) }
            },
            sealOwned: sealOwned, sealPrice: GameSeason.sealPrice
        )
    }

    static let trophies = GameTrophiesBlock(
        items: [
            GameTrophyItem(key: "trophy.league-cup.2026-10-05.jade.gold", awardedAt: "2026-10-12T00:05:00.000Z"),
            GameTrophyItem(key: "trophy.flame.100", awardedAt: "2026-10-01T10:00:00.000Z"),
        ],
        order: ["trophy.flame.100", "trophy.league-cup.2026-10-05.jade.gold"]
    )

    static let atlas = GameAtlasBlock(
        stamped: 1, total: GameAtlas.total, stamps: [.init(language: "ja", stampedOn: "2026-10-13")],
        pending: [.init(language: "sw", sent: true, received: false)]
    )

    static let visibility = GameVisibility(showcase: .friends, rank: .friends, treasury: .me, atlas: .me)

    /// Un bloc de niveau 100 prêt pour le Prestige.
    static func atLevel100(prestige stars: Int = 0) -> GameBlock {
        let base = GameFixture.game(score: GameLevels.threshold(of: 100))
        let level = GameBlock.Level(
            level: 100, tier: .galaxie, score: base.level.score, floorScore: base.level.floorScore, nextThreshold: nil,
            pointsToNext: 0, progress: 1, record: 100, prestige: stars, canPrestige: GameLevels.canPrestige(level: 100, prestige: stars)
        )
        return base.replacing(
            level: level,
            wave2: GameWave2(
                league: league(), duo: duo(), season: season(), trophies: trophies, atlas: atlas,
                prestige: GamePrestigeBlock(stars: stars, max: 5, canPrestige: level.canPrestige, gloryOnPass: 1000),
                visibility: visibility
            )
        )
    }

    static func game(
        league: GameLeagueBlock? = league(), duo: GameDuoBlock? = duo(), season: GameSeasonBlock? = season(),
        held: Int = 12
    ) -> GameBlock {
        GameFixture.game(held: held).replacing(wave2: GameWave2(
            league: league, duo: duo, season: season, trophies: trophies, atlas: atlas,
            prestige: GamePrestigeBlock(stars: 0, max: 5, canPrestige: false, gloryOnPass: 1000), visibility: visibility
        ))
    }

    static func state(_ game: GameBlock = game(), balance: Int = 12) -> GameState {
        GameState(game: game, meesh: GameFixture.meesh(balance: balance))
    }
}
