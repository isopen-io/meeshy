import Foundation
import Testing
@testable import MeeshySDK

/// Les COMPORTEMENTS de la loi du Jeu, un par un — là où un vecteur ne dirait
/// qu'un chiffre. Les cas de bout en bout vivent dans `GameLawVectorTests`.
@Suite("Jeu Meeshy — comportements de la loi")
struct GameLawTests {

    // MARK: Niveaux

    @Test("le niveau 1 dure jusqu'à 39 points, et sa barre part de zéro")
    func levelOneSpansUpToThirtyNine() {
        let p = GameLevels.progress(forScore: 39)
        #expect(p.level == 1)
        #expect(p.floorScore == 0)
        #expect(p.nextThreshold == 40)
        #expect(p.pointsToNext == 1)
        #expect(GameLevels.progress(forScore: 40).level == 2)
    }

    @Test("le niveau 100 est le dernier : plus de seuil, barre pleine")
    func levelHundredIsFull() {
        let p = GameLevels.progress(forScore: 400_000)
        #expect(p.level == 100)
        #expect(p.isMax)
        #expect(p.nextThreshold == nil)
        #expect(p.progress == 1)
        #expect(p.tier == .galaxie)
    }

    @Test("un score négatif lit le niveau 1")
    func negativeScoreReadsLevelOne() {
        #expect(GameLevels.progress(forScore: -50).level == 1)
        #expect(GameLevels.progress(forScore: -50).score == 0)
    }

    @Test("les dix paliers de nom suivent les dizaines de niveaux")
    func tiersFollowTens() {
        #expect(GameLevels.tier(of: 9) == .etincelle)
        #expect(GameLevels.tier(of: 10) == .lueur)
        #expect(GameLevels.tier(of: 89) == .constellation)
        #expect(GameLevels.tier(of: 90) == .galaxie)
        #expect(GameLevels.tier(of: 100) == .galaxie)
    }

    @Test("le palier a un rang de 1 à 10 et s'écrit en chiffres romains de I à X")
    func tierOrdinalAndRoman() {
        #expect(LevelTierKey.allCases.map(\.ordinal) == Array(1...10))
        #expect(LevelTierKey.allCases.map(\.romanNumeral) == ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"])
        #expect(LevelTierKey.eclat.ordinal == 4)
        #expect(GameLevels.tier(of: 34).romanNumeral == "IV")
        #expect(GameLevels.tier(of: 100).romanNumeral == "X")
    }

    @Test("le record ne redescend jamais, et seuls les niveaux inédits comptent")
    func recordNeverDrops() {
        #expect(GameLevels.record(level: 32, previousRecord: 36) == 36)
        #expect(GameLevels.newLevelsReached(level: 32, previousRecord: 36).count == 0)
        let fresh = GameLevels.newLevelsReached(level: 34, previousRecord: 30)
        #expect(fresh.from == 31 && fresh.to == 34 && fresh.count == 4)
        #expect(GameLevels.newLevelsReached(level: 2, previousRecord: nil).count == 1)
    }

    @Test("le Prestige s'ouvre au niveau 100, avec cinq étoiles au plus")
    func prestigeRules() {
        #expect(GameLevels.canPrestige(level: 100, prestige: 4))
        #expect(!GameLevels.canPrestige(level: 100, prestige: 5))
        #expect(!GameLevels.canPrestige(level: 99, prestige: 0))
    }

    // MARK: Frappe

    @Test("le prix monte de 6 % tous les dix numéros et s'arrête à quatre fois la base")
    func priceGrowsAndCaps() {
        #expect(GameMint.price(forNumber: 1) == 1221)
        #expect(GameMint.price(forNumber: 10) == 1221)
        #expect(GameMint.price(forNumber: 11) == 1294)
        #expect(GameMint.price(forNumber: 250) == 4884)
        #expect(GameMint.price(forNumber: 5000) == 4884)
        #expect(GameMint.price(forNumber: 0) == 1221)
    }

    /// Les entrées viennent du réseau (`mint.number`, `level.score`, `flame.days`) : une
    /// valeur démesurée se lit au plafond de la loi, comme en TypeScript — jamais un
    /// débordement d'entier qui ferait planter l'app sur une charge reçue.
    @Test("une valeur démesurée reçue du réseau se lit au plafond, sans planter")
    func hugeValuesReadAtTheCeiling() {
        #expect(GameMint.price(forNumber: 7_000) == 4884)
        #expect(GameMint.price(forNumber: 200_000) == 4884)
        #expect(GameMint.price(forNumber: Int.max) == 4884)
        #expect(GameMint.preview(score: 0, mintedLifetime: Int.max, debitablePoints: 0).price == 4884)
        #expect(GameLevels.level(forScore: Int.max) == 100)
        #expect(GameLevels.progress(forScore: Int.max).isMax)
        #expect(GameFlame.bonusPercent(forDays: Int.max) == 50)
        #expect(GameMissions.reward(basePoints: 30, level: 1, flameDays: Int.max)
            == GameMissions.reward(basePoints: 30, level: 1, flameDays: 25))
    }

    @Test("chaque centième est en or, chaque millième en prisme")
    func editions() {
        #expect(GameMint.edition(forNumber: 13) == .silver)
        #expect(GameMint.edition(forNumber: 100) == .gold)
        #expect(GameMint.edition(forNumber: 1000) == .prism)
        #expect(GameMint.edition(forNumber: 0) == .silver)
    }

    @Test("sans assez de points débitables, la frappe est refusée et le niveau ne bouge pas")
    func previewWithoutEnoughPoints() {
        let preview = GameMint.preview(score: 2000, mintedLifetime: 0, debitablePoints: 1000)
        #expect(!preview.canMint)
        #expect(preview.missingPoints == 221)
        #expect(preview.levelAfter == preview.levelBefore)
        #expect(preview.levelsLost == 0)
        #expect(preview.gloryGained == 0)
    }

    @Test("une frappe possible coûte des niveaux et rapporte 100 de Gloire")
    func previewWithEnoughPoints() {
        let preview = GameMint.preview(score: 12_180, mintedLifetime: 12, debitablePoints: 12_180)
        #expect(preview.canMint)
        #expect(preview.number == 13)
        #expect(preview.price == 1294)
        #expect(preview.levelsLost == preview.levelBefore - preview.levelAfter)
        #expect(preview.levelsLost > 0)
        #expect(preview.gloryGained == 100)
    }

    // MARK: Gloire

    @Test("la Gloire se coupe en tiers égaux et Légende avance par 40 000")
    func divisionBoundaries() {
        let murmure = GameGlory.steps.filter { $0.rank == .murmure }.map(\.minGlory)
        #expect(murmure == [0, 166, 333])
        let legende = GameGlory.steps.filter { $0.rank == .legende }.map(\.minGlory)
        #expect(legende == [80_000, 120_000, 160_000])
        #expect(GameGlory.steps.count == 30)
    }

    @Test("Légende I n'a plus de suite")
    func legendTopHasNoNext() {
        let s = GameGlory.standing(glory: 900_000, mythic: false)
        #expect(s.rank == .legende)
        #expect(s.division == .i)
        #expect(s.next == nil)
        #expect(s.gloryMissing == nil)
        #expect(s.progress == 1)
    }

    @Test("Mythe est un drapeau du serveur, refusé sous Légende")
    func mythicNeedsLegend() {
        #expect(GameGlory.standing(glory: 200_000, mythic: true).rank == .mythe)
        #expect(GameGlory.standing(glory: 200_000, mythic: true).division == nil)
        #expect(GameGlory.standing(glory: 3000, mythic: true).rank == .voix)
    }

    @Test("les records de Flamme ne paient qu'une fois chacun")
    func flameRecordsPayOnce() {
        #expect(GameGlory.gloryForFlameRecords(previousLongest: 6, longest: 7) == 50)
        #expect(GameGlory.gloryForFlameRecords(previousLongest: 7, longest: 29) == 0)
        #expect(GameGlory.gloryForFlameRecords(previousLongest: 0, longest: 365) == 2700)
    }

    // MARK: Trésor

    @Test("le trésor n'a pas de palier sans Meesh et finit à la réserve")
    func treasuryEnds() {
        #expect(GameTreasury.standing(held: 0).tier == nil)
        #expect(GameTreasury.standing(held: 0).next?.key == .bourse)
        let top = GameTreasury.standing(held: 5000)
        #expect(top.tier == .reserve)
        #expect(top.next == nil)
    }

    // MARK: Flamme

    @Test("un gel couvre un jour manqué, mais tout ou rien")
    func freezesCoverAllOrNothing() {
        let covered = GameFlame.advance(lastActiveDay: "2026-10-03", today: "2026-10-05", streak: 10, freezes: 2)
        #expect(covered.outcome == .protected)
        #expect(covered.streak == 11)
        #expect(covered.freezes == 1)

        let broken = GameFlame.advance(lastActiveDay: "2026-10-01", today: "2026-10-05", streak: 10, freezes: 2)
        #expect(broken.outcome == .broken)
        #expect(broken.streak == 1)
        #expect(broken.freezes == 2)
        #expect(broken.lostStreak == 10)
    }

    @Test("le bonus de Flamme plafonne à 50 % dès 25 jours")
    func bonusCaps() {
        #expect(GameFlame.bonusPercent(forDays: 5) == 10)
        #expect(GameFlame.bonusPercent(forDays: 25) == 50)
        #expect(GameFlame.bonusPercent(forDays: 400) == 50)
        #expect(GameFlame.form(forDays: 0) == nil)
        #expect(GameFlame.form(forDays: 365) == .soleil)
    }

    @Test("le rallumage dit pourquoi il refuse")
    func relightRefusals() {
        func decision(today: String, last: String? = nil, balance: Int = 3, streak: Int = 12) -> RelightDecision {
            GameFlame.relightDecision(lastActiveDay: "2026-10-02", today: today, streakBeforeBreak: streak,
                                      lastRelightDay: last, balance: balance)
        }
        #expect(decision(today: "2026-10-03").refusal == .notExtinguished)
        #expect(decision(today: "2026-10-04").allowed)
        #expect(decision(today: "2026-10-05").allowed)
        #expect(decision(today: "2026-10-06").refusal == .windowClosed)
        #expect(decision(today: "2026-10-04", last: "2026-10-01").refusal == .monthlyLimit)
        #expect(decision(today: "2026-10-04", last: "2026-09-28").allowed)
        #expect(decision(today: "2026-10-04", balance: 2).refusal == .insufficientBalance)
        #expect(decision(today: "2026-10-04", streak: 0).refusal == .noStreak)
    }

    @Test("un gel s'achète tant qu'il y en a moins de deux et qu'on a une Meesh")
    func freezePurchase() {
        #expect(GameFlame.freezeRefusal(freezes: 1, balance: 1) == nil)
        #expect(GameFlame.freezeRefusal(freezes: 2, balance: 9) == .atMaximum)
        #expect(GameFlame.freezeRefusal(freezes: 0, balance: 0) == .insufficientBalance)
    }

    @Test("rallumer rend la série d'avant la rupture, ancrée à la veille")
    func relightAnchorsToYesterday() {
        let relit = GameFlame.relight(today: "2026-03-01", streakBeforeBreak: 12)
        #expect(relit.streak == 12)
        #expect(relit.lastActiveDay == "2026-02-28")
    }

    // MARK: Jours

    @Test("les clés de jour illisibles ne plantent pas : elles ne disent rien")
    func invalidDayKeysAreInert() {
        #expect(GameDay.number(of: "2026-02-30") == nil)
        #expect(GameDay.number(of: "hier") == nil)
        #expect(GameDay.number(of: "2026-1-05") == nil)
        let untouched = GameFlame.advance(lastActiveDay: "n'importe quoi", today: "2026-10-05", streak: 4, freezes: 1)
        #expect(untouched.outcome == .sameDay)
        #expect(untouched.streak == 4)
    }

    @Test("le calendrier est celui du grégorien, bissextile compris")
    func calendar() {
        #expect(GameDay.number(of: "1970-01-01") == 0)
        #expect(GameDay.number(of: "2026-10-05") == 20_731)
        #expect(GameDay.isDayKey("2028-02-29"))
        #expect(!GameDay.isDayKey("2026-02-29"))
        #expect(GameDay.add(1, to: "2028-02-28") == "2028-02-29")
        #expect(GameDay.add(1, to: "2026-12-31") == "2027-01-01")
        #expect(GameDay.diff(from: "2026-12-31", to: "2027-01-02") == 2)
        #expect(GameDay.month(of: "2026-10-05") == "2026-10")
    }

    // MARK: Hasard

    @Test("la graine est FNV-1a sur les octets UTF-8")
    func seedIsFNV() {
        #expect(GameSeed.fnv1a("") == 0x811c_9dc5)
        #expect(GameSeed.fnv1a("a") == 0xe40c_292c)
        #expect(GameSeed.fnv1a("é") != GameSeed.fnv1a("e"))
    }

    @Test("deux générateurs de même graine tirent la même suite, dans [0, 1)")
    func randomIsDeterministic() {
        var first = GameRandom(seed: 42)
        var second = GameRandom(seed: 42)
        let a = (0..<50).map { _ in first.next() }
        let b = (0..<50).map { _ in second.next() }
        #expect(a == b)
        #expect(a.allSatisfy { $0 >= 0 && $0 < 1 })
    }

    @Test("un indice tiré dans une liste vide consomme quand même un tirage")
    func pickOnEmptyConsumesADraw() {
        var picker = GameRandom(seed: 7)
        var reference = GameRandom(seed: 7)
        _ = picker.pickIndex(length: 0)
        _ = reference.next()
        #expect(picker.next() == reference.next())
    }

    // MARK: Missions

    @Test("objectif et récompense se calculent en entiers exacts")
    func integerMath() {
        #expect(GameMissions.objective(baseTarget: 5, level: 34) == 10)
        #expect(GameMissions.objective(baseTarget: 1, level: 50) == 3)
        #expect(GameMissions.reward(basePoints: 30, level: 5, flameDays: 0) == 30)
        #expect(GameMissions.reward(basePoints: 60, level: 34, flameDays: 23) == 127)
    }

    @Test("le tirage du jour donne trois missions de signaux distincts, l'Or dès le niveau 50")
    func drawShape() {
        let nominal = GameMissions.draw(MissionDrawInput(userId: "u1", dayKey: "2026-10-05", level: 20, flameDays: 5, treasury: 0))
        #expect(nominal.missions.map(\.difficulty) == [.easy, .medium, .hard])
        #expect(Set(nominal.missions.map(\.signal)).count == 3)

        let gold = GameMissions.draw(MissionDrawInput(userId: "u1", dayKey: "2026-10-05", level: 50, flameDays: 5, treasury: 0))
        #expect(gold.missions.map(\.difficulty) == [.easy, .medium, .gold])
        #expect(gold.missions.last?.glory == 40)

        let rich = GameMissions.draw(MissionDrawInput(userId: "u1", dayKey: "2026-10-05", level: 12, flameDays: 5, treasury: 50))
        #expect(rich.missions.last?.difficulty == .gold)
    }

    @Test("le catalogue couvre les quatre buts, deux gabarits au moins par difficulté, l'Or porte aussi les difficiles (#9635)")
    func catalogCoversTheFourGoals() {
        let keys = GameMissions.templates.map(\.key)
        #expect(Set(keys).count == keys.count)
        for goal in MissionGoal.allCases {
            #expect(GameMissions.templates.filter { $0.goal == goal }.count >= 3)
        }
        for difficulty in MissionDifficulty.allCases {
            #expect(GameMissions.catalog(for: difficulty).count >= 2)
        }
        let gold = GameMissions.catalog(for: .gold)
        #expect(gold.allSatisfy { $0.difficulty == .gold && $0.basePoints == 320 })
        #expect(GameMissions.catalog(for: .hard).allSatisfy { hard in gold.contains { $0.key == hard.key } })
        #expect(GameMissions.templates.filter { $0.goal == .reach }.allSatisfy { $0.glory > 0 })
    }

    @Test("un signal impossible pour ce compte n'est jamais tiré")
    func unavailableSignalsAreSkipped() {
        let banned: [MissionSignal] = [.foreignLanguageMessage, .axis(.reaction)]
        for day in 1...28 {
            let key = String(format: "2026-10-%02d", day)
            let draw = GameMissions.draw(MissionDrawInput(userId: "u1", dayKey: key, level: 20, flameDays: 0,
                                                          treasury: 0, unavailableSignals: banned))
            #expect(draw.missions.allSatisfy { !banned.contains($0.signal) })
        }
    }

    @Test("le même jour, le même utilisateur, les mêmes missions")
    func drawIsDeterministic() {
        let input = MissionDrawInput(userId: "6502f1a2b3c4d5e6f7a8b9c0", dayKey: "2026-10-06", level: 34, flameDays: 23, treasury: 0)
        #expect(GameMissions.draw(input) == GameMissions.draw(input))
    }

    @Test("un jour sur trois est un jour du Prisme, et le jour illisible n'en est pas un")
    func prismDayRhythm() {
        let prismDays = (1...30).filter { GameMissions.isPrismDay(userId: "u1", dayKey: String(format: "2026-10-%02d", $0)) }
        #expect(prismDays.count == 10)
        #expect(!GameMissions.isPrismDay(userId: "u1", dayKey: "n'importe quoi"))
    }

    @Test("changer une mission garde sa difficulté et change de gabarit")
    func rerollKeepsDifficulty() {
        let today = GameMissions.draw(MissionDrawInput(userId: "u1", dayKey: "2026-10-05", level: 30, flameDays: 5, treasury: 0))
        for index in today.missions.indices {
            let rerolled = GameMissions.reroll(userId: "u1", dayKey: "2026-10-05", level: 30, flameDays: 5,
                                               missions: today.missions, index: index, rerollCount: 1)
            #expect(rerolled?.difficulty == today.missions[index].difficulty)
            #expect(rerolled?.templateKey != today.missions[index].templateKey)
            #expect(rerolled.map { !today.missions.map(\.signal).contains($0.signal) } ?? false)
        }
        #expect(GameMissions.reroll(userId: "u1", dayKey: "2026-10-05", level: 30, flameDays: 5,
                                    missions: today.missions, index: 9, rerollCount: 1) == nil)
    }

    // MARK: Boosts et coffre

    @Test("le Vent arrière ne souffle que sous le niveau record")
    func tailwind() {
        #expect(GameBoosts.tailwind(level: 32, levelRecord: 36) == 1.25)
        #expect(GameBoosts.tailwind(level: 36, levelRecord: 36) == 1)
    }

    @Test("l'Heure du Prisme tient dans 9 h – 21 h, sur un quart d'heure")
    func prismHourWindow() {
        for day in 1...28 {
            let window = GameBoosts.prismHour(userId: "u1", dayKey: String(format: "2026-10-%02d", day))
            #expect(window.startMinute >= 540)
            #expect(window.endMinute <= 1260)
            #expect(window.endMinute - window.startMinute == 60)
            #expect(window.startMinute % 15 == 0)
            #expect(window.contains(minuteOfDay: window.startMinute))
            #expect(!window.contains(minuteOfDay: window.endMinute))
        }
    }

    @Test("le coffre du jour tient dans ses bornes annoncées")
    func chestBounds() {
        for day in 1...28 {
            let chest = GameChest.daily(userId: "u1", dayKey: String(format: "2026-10-%02d", day))
            #expect((60...200).contains(chest.points))
        }
        #expect(GameChest.odds.fragment == 1.0 / 6.0)
    }

    // MARK: Guide

    @Test("l'intégration suit sept étapes et reprend à la première non vue")
    func onboardingResumes() {
        #expect(GameGuide.onboardingSteps.map(\.index) == Array(1...7))
        #expect(GameGuide.nextOnboardingStep(seen: [String]())?.key == .welcome)
        let seen = ["welcome", "first-points"].map { "onboarding.\($0)" }
        #expect(GameGuide.nextOnboardingStep(seen: seen)?.key == .levels)
        let all = GameGuide.onboardingSteps.map { GameGuide.onboardingSeenKey($0.key) }
        #expect(GameGuide.nextOnboardingStep(seen: all) == nil)
    }

    @Test("une seule carte : l'inédit passe devant le déjà vu, le rang devant le reste")
    func oneCardPerOpening() {
        let events: [GuideEvent] = [
            .firstLevel(level: 2, pointsToNext: 50),
            .newRank(rank: .voix, division: .ii, glory: 2200, gloryMissing: 634),
            .flameAtRisk(days: 12),
        ]
        #expect(GameGuide.chooseMoment(events: events, seen: [String]())?.key == .newRank)
        #expect(GameGuide.chooseMoment(events: events, seen: ["new-rank"])?.key == .flameAtRisk)
        let allSeen = GameGuide.chooseMoment(events: events, seen: ["new-rank", "flame-at-risk", "first-level"])
        #expect(allSeen?.key == .newRank)
        #expect(allSeen?.presentation == .short)
        #expect(GameGuide.chooseMoment(events: [], seen: [String]()) == nil)
    }

    @Test("chaque moment du catalogue a un locuteur, une humeur et une suite")
    func everyMomentHasAVoice() {
        let events: [GuideEvent] = [
            .firstLevel(level: 2, pointsToNext: 50), .newTier(tier: .lueur, nextTierLevel: 20), .missionsUnlocked,
            .firstMintPossible(price: 1221, levelsLost: 5, gloryGain: 100),
            .firstMint(levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14), .badgeExtinguished(missingActions: 37),
            .priceRises(nextPrice: 1294), .newRank(rank: .mythe, division: nil, glory: 200_000, gloryMissing: nil),
            .treasuryTier(tier: .escarcelle, nextTierMissing: 40), .flameAtRisk(days: 12),
            .flameOut(lostDays: 12, relightPrice: 3, canRelight: true), .returnAfterAbsence(daysAway: 9),
            .level100(canPrestige: true),
        ]
        #expect(Set(events.map(\.key)) == Set(GuideMomentKey.allCases))
        #expect(Set(GameGuide.momentPriority) == Set(GuideMomentKey.allCases))
        for event in events {
            let moment = GameGuide.moment(for: event, seen: [String]())
            #expect(moment.key == event.key)
            #expect(moment.presentation == .full)
        }
    }
}
