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
/// éteint » n'est annoncé que si le calcul AVANT la frappe existait.
enum GameGuideEvents {

    static let absenceDays = 7

    /// Le palier se lit sur la VÉRITÉ (`level.shown`, #9688) : les champs d'hier s'arrêtent à Galaxie.
    private static func tierIndex(_ game: GameBlock) -> Int {
        LevelTierKey.allCases.firstIndex(of: game.level.shown.tier) ?? 0
    }

    private static func treasuryIndex(_ game: GameBlock) -> Int {
        guard let tier = game.treasury.tier else { return -1 }
        return TreasuryTierKey.allCases.firstIndex(of: tier) ?? -1
    }

    /// Un ordre total des (rang, division V–I) : une division gagnée est une marche, un rang aussi —
    /// V → IV compte, même quand la projection héritée reste à III (#9636).
    static func standingOrder(_ game: GameBlock) -> Int {
        game.glory.rank.index * 6 + (game.glory.shownDivision.map { 5 - $0.rawValue } ?? 5)
    }

    /// Une marche GAGNÉE — jamais la marche retrouvée quand un geste refusé restaure la lecture d'avant.
    static func rankClimbed(from before: GameBlock, to after: GameBlock) -> Bool {
        standingOrder(after) > standingOrder(before)
    }

    /// Le premier niveau du palier suivant — `nil` après Singularité, qui n'a pas de fin (#9688).
    static func nextTierLevel(after tier: LevelTierKey) -> Int? {
        let tiers = LevelTierKey.allCases
        guard let index = tiers.firstIndex(of: tier), tiers.index(after: index) < tiers.endIndex else { return nil }
        return GameLevels.tierStart(of: tiers[tiers.index(after: index)])
    }

    private static func rankEvent(_ game: GameBlock) -> GuideEvent {
        .newRank(rank: game.glory.rank, division: game.glory.shownDivision, glory: game.glory.glory,
                 gloryMissing: game.glory.gloryMissing)
    }

    private static func flameOutEvent(_ game: GameBlock) -> GuideEvent {
        .flameOut(lostDays: 0, relightPrice: game.flame.relightPrice, canRelight: game.flame.canRelight)
    }

    static func standing(game: GameBlock, seen: Set<String>, daysAway: Int?) -> [GuideEvent] {
        var discoveries: [GuideEvent] = []
        let shown = game.level.shown
        if shown.level >= 2 {
            discoveries.append(.firstLevel(level: shown.level, pointsToNext: shown.pointsToNext))
        }
        if tierIndex(game) >= 1 {
            discoveries.append(.newTier(tier: shown.tier, nextTierLevel: nextTierLevel(after: shown.tier)))
        }
        if game.missions.unlocked {
            discoveries.append(.missionsUnlocked)
        }
        if game.mint.canMint && game.mint.number == 1 {
            discoveries.append(.firstMintPossible(price: game.mint.price, levelsLost: game.mint.shownLevels.levelsLost,
                                                  gloryGain: game.mint.gloryGained))
        }
        if game.glory.rank != .murmure {
            discoveries.append(rankEvent(game))
        }
        if let tier = game.treasury.tier {
            discoveries.append(.treasuryTier(tier: tier, nextTierMissing: game.treasury.next?.missing))
        }
        if shown.level >= GameLevels.prestigeLevel {
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

    /// `badgeImpactBefore` : ce que la frappe ALLAIT éteindre, calculé sur la lecture d'AVANT le geste —
    /// c'est lui qui dit « 11 actions pour le rallumer ». Absent (serveur sans points par axe), rien n'est annoncé.
    static func transitions(from before: GameBlock, to after: GameBlock, badgeImpactBefore: MintBadgeImpact? = nil) -> [GuideEvent] {
        var events: [GuideEvent] = []
        let shownBefore = before.level.shown
        let shownAfter = after.level.shown
        if shownBefore.level < 2 && shownAfter.level >= 2 {
            events.append(.firstLevel(level: shownAfter.level, pointsToNext: shownAfter.pointsToNext))
        }
        if tierIndex(after) > tierIndex(before) {
            events.append(.newTier(tier: shownAfter.tier, nextTierLevel: nextTierLevel(after: shownAfter.tier)))
        }
        if !before.missions.unlocked && after.missions.unlocked {
            events.append(.missionsUnlocked)
        }
        if before.mint.number == 1 && after.mint.number == 2 {
            events.append(.firstMint(levelBefore: shownBefore.level, levelAfter: shownAfter.level,
                                     tailwindUntilLevel: shownAfter.record))
        }
        if after.mint.price > before.mint.price {
            events.append(.priceRises(nextPrice: after.mint.price))
        }
        if after.mint.number > before.mint.number, let impact = badgeImpactBefore, impact.lost > 0 {
            events.append(.badgeExtinguished(missingActions: impact.regain))
        }
        if rankClimbed(from: before, to: after) {
            events.append(rankEvent(after))
        }
        if treasuryIndex(after) > treasuryIndex(before), let tier = after.treasury.tier {
            events.append(.treasuryTier(tier: tier, nextTierMissing: after.treasury.next?.missing))
        }
        if before.flame.status != .out && after.flame.status == .out {
            events.append(flameOutEvent(after))
        }
        if shownBefore.level < GameLevels.prestigeLevel && shownAfter.level >= GameLevels.prestigeLevel {
            events.append(.level100(canPrestige: after.level.canPrestige))
        }
        return events
    }
}
