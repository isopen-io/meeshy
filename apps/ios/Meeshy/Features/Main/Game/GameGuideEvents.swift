import Foundation
import MeeshySDK

/// LES ÉVÉNEMENTS DU GUIDE (#9379) — la loi (`GameGuide.chooseMoment`) choisit LE
/// moment parmi des événements ; ce fichier les relève dans l'état du jeu.
/// Miroir de `apps/web/src/lib/game-guide/events.ts`.
///
/// Deux sources, qui ne se confondent pas :
///
///  - `standing` lit l'ÉTAT à l'ouverture de l'écran. Une découverte (« tu es au
///    palier Lueur ») ne se dit qu'UNE fois : tant que sa clé n'est pas vue.
///    Trois états sont des URGENCES et se redisent à chaque ouverture — la
///    Flamme en danger, la Flamme éteinte, le retour après une absence.
///  - `transitions` compare deux lectures pendant que l'écran est ouvert : ce
///    qui vient d'ARRIVER (un palier franchi, une frappe) se dit chaque fois,
///    version complète la première fois, courte ensuite (la loi en décide, par
///    les clés vues).
///
/// Ce que le bloc `game` ne sert pas n'est jamais inventé : une Flamme éteinte
/// ne dit pas combien de jours elle valait (`lostDays: 0`), et « un badge s'est
/// éteint » n'est pas annoncé tant que le plan de débit n'est pas porté sur iOS.
enum GameGuideEvents {

    static let absenceDays = 7

    private static func tierIndex(_ game: GameBlock) -> Int {
        LevelTierKey.allCases.firstIndex(of: game.level.tier) ?? 0
    }

    private static func treasuryIndex(_ game: GameBlock) -> Int {
        guard let tier = game.treasury.tier else { return -1 }
        return TreasuryTierKey.allCases.firstIndex(of: tier) ?? -1
    }

    /// Un ordre total des (rang, division) : une division gagnée est une marche, un rang aussi.
    private static func standingOrder(_ game: GameBlock) -> Int {
        game.glory.rank.index * 4 + (game.glory.division.map { 3 - $0.rawValue } ?? 3)
    }

    private static func nextTierLevel(_ game: GameBlock) -> Int? {
        let next = tierIndex(game) + 1
        return next >= LevelTierKey.allCases.count ? nil : next * 10
    }

    private static func rankEvent(_ game: GameBlock) -> GuideEvent {
        .newRank(rank: game.glory.rank, division: game.glory.division, glory: game.glory.glory,
                 gloryMissing: game.glory.gloryMissing)
    }

    private static func flameOutEvent(_ game: GameBlock) -> GuideEvent {
        .flameOut(lostDays: 0, relightPrice: game.flame.relightPrice, canRelight: game.flame.canRelight)
    }

    static func standing(game: GameBlock, seen: Set<String>, daysAway: Int?) -> [GuideEvent] {
        var discoveries: [GuideEvent] = []
        if game.level.level >= 2 {
            discoveries.append(.firstLevel(level: game.level.level, pointsToNext: game.level.pointsToNext))
        }
        if tierIndex(game) >= 1 {
            discoveries.append(.newTier(tier: game.level.tier, nextTierLevel: nextTierLevel(game)))
        }
        if game.missions.unlocked {
            discoveries.append(.missionsUnlocked)
        }
        if game.mint.canMint && game.mint.number == 1 {
            discoveries.append(.firstMintPossible(price: game.mint.price, levelsLost: game.mint.levelsLost,
                                                  gloryGain: game.mint.gloryGained))
        }
        if game.glory.rank != .murmure {
            discoveries.append(rankEvent(game))
        }
        if let tier = game.treasury.tier {
            discoveries.append(.treasuryTier(tier: tier, nextTierMissing: game.treasury.next?.missing))
        }
        if game.level.level == 100 {
            discoveries.append(.level100(canPrestige: game.level.canPrestige))
        }

        var urgencies: [GuideEvent] = []
        if game.flame.status == .atRisk {
            urgencies.append(.flameAtRisk(days: game.flame.days))
        }
        if game.flame.status == .out {
            urgencies.append(flameOutEvent(game))
        }
        if let daysAway, daysAway >= absenceDays {
            urgencies.append(.returnAfterAbsence(daysAway: daysAway))
        }

        return discoveries.filter { !seen.contains($0.key.rawValue) } + urgencies
    }

    static func transitions(from before: GameBlock, to after: GameBlock) -> [GuideEvent] {
        var events: [GuideEvent] = []
        if before.level.level < 2 && after.level.level >= 2 {
            events.append(.firstLevel(level: after.level.level, pointsToNext: after.level.pointsToNext))
        }
        if tierIndex(after) > tierIndex(before) {
            events.append(.newTier(tier: after.level.tier, nextTierLevel: nextTierLevel(after)))
        }
        if !before.missions.unlocked && after.missions.unlocked {
            events.append(.missionsUnlocked)
        }
        if before.mint.number == 1 && after.mint.number == 2 {
            events.append(.firstMint(levelBefore: before.level.level, levelAfter: after.level.level,
                                     tailwindUntilLevel: after.level.record))
        }
        if after.mint.price > before.mint.price {
            events.append(.priceRises(nextPrice: after.mint.price))
        }
        if standingOrder(after) > standingOrder(before) {
            events.append(rankEvent(after))
        }
        if treasuryIndex(after) > treasuryIndex(before), let tier = after.treasury.tier {
            events.append(.treasuryTier(tier: tier, nextTierMissing: after.treasury.next?.missing))
        }
        if before.flame.status != .out && after.flame.status == .out {
            events.append(flameOutEvent(after))
        }
        if before.level.level < 100 && after.level.level == 100 {
            events.append(.level100(canPrestige: after.level.canPrestige))
        }
        return events
    }
}
