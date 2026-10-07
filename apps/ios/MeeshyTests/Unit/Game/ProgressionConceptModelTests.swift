import XCTest
@testable import Meeshy
import MeeshySDK

/// **Chaque concept servi a sa carte, sa fiche et son bloc** (#9564) — la première page, les fiches et le tableau
/// de bord PARCOURENT `ProgressionConcepts.served` et lisent `ProgressionConceptModel`. Ces témoins interrogent la
/// loi, pas le rendu : ce qu'un concept dit ne dépend d'aucune vue.
@MainActor
final class ProgressionConceptModelTests: XCTestCase {

    private func progress(_ game: GameBlock?, meesh: APIEngagementProgress.Meesh? = GameFixture.meesh()) -> EngagementProgress {
        guard let game else {
            return EngagementProgressResolver.resolve(APIEngagementProgress(
                counters: [.init(axisKey: "content.text_message", count: 12)], milestones: [],
                streak: .init(currentStreakDays: 4, longestStreakDays: 9), level: .init(engagementScore: 36), meesh: meesh
            ))
        }
        return EngagementProgressResolver.resolve(GameFixture.snapshot(game, meesh: meesh))
    }

    // MARK: - La liste

    func test_cards_fullGame_oneCardPerConcept_inTheDeclaredOrder() {
        let game = GameWave2Fixture.game()
        let cards = ProgressionConceptModel.cards(progress: progress(game), game: game)

        XCTAssertEqual(cards.map(\.concept), ProgressionConcept.allCases, "les quinze concepts, dans l'ordre du partagé")
    }

    func test_cards_oldServer_keepsTheLinesOfBefore_andNoneOfTheGame() {
        let cards = ProgressionConceptModel.cards(progress: progress(nil), game: nil)

        XCTAssertEqual(cards.map(\.concept), [.level, .meesh, .flame, .elans, .badges, .defis, .succes],
                       "devant un ancien serveur : niveau, Meeshes, Flamme, Élans, badges, défis, succès")
    }

    func test_cards_oldServerWithoutBalance_dropsTheMeeshLine() {
        let cards = ProgressionConceptModel.cards(progress: progress(nil, meesh: nil), game: nil)

        XCTAssertFalse(cards.map(\.concept).contains(.meesh), "un solde que le serveur ne sert pas ne se dit pas « 0 »")
    }

    func test_cards_gameWithoutWave2_hasNoLeagueSeasonPrestigeShowcaseAtlas() {
        let game = GameFixture.game()
        let concepts = ProgressionConceptModel.cards(progress: progress(game), game: game).map(\.concept)

        for absent in [ProgressionConcept.league, .season, .prestige, .showcase, .atlas] {
            XCTAssertFalse(concepts.contains(absent), "\(absent.rawValue) : son extension n'est pas servie")
        }
        for present in [ProgressionConcept.points, .glory, .missions] {
            XCTAssertTrue(concepts.contains(present), "\(present.rawValue) : le bloc game est servi")
        }
    }

    func test_cards_aNullSeasonOnAWave2Server_keepsItsLine_andSaysSo() {
        let game = GameWave2Fixture.game(season: nil)
        let cards = ProgressionConceptModel.cards(progress: progress(game), game: game)

        let season = cards.first { $0.concept == .season }
        XCTAssertEqual(season?.value, GameText.doorSeasonNone, "aucune saison ne court : la ligne reste et le dit")
    }

    // MARK: - La carte à trois étages (amendement porteur)

    func test_everyServedConcept_showsAValue_atLeastOneImportantDatum_itsWhy_andItsHow() {
        let full = GameWave2Fixture.game()
        for (label, game) in [("jeu complet", Optional(full)), ("jeu sans vague 2", Optional(GameFixture.game())), ("ancien serveur", nil)] {
            for card in ProgressionConceptModel.cards(progress: progress(game), game: game) {
                let key = "\(card.concept.rawValue) (\(label))"
                XCTAssertFalse(card.name.isEmpty, "\(key) : pas de nom")
                XCTAssertFalse(card.value.isEmpty, "\(key) : pas de valeur")
                XCTAssertFalse(card.chips.isEmpty, "\(key) : aucune donnée importante")
                XCTAssertLessThanOrEqual(card.chips.count, ProgressionConceptModel.maxChips, "\(key) : trois données au plus")
                XCTAssertEqual(Set(card.chips).count, card.chips.count, "\(key) : une donnée répétée")
                XCTAssertFalse(card.chips.contains(""), "\(key) : une pastille vide")
                XCTAssertFalse(card.why.isEmpty, "\(key) : pas de « à quoi ça sert »")
                XCTAssertFalse(card.how.isEmpty, "\(key) : pas de « comment ça marche »")
                XCTAssertNotEqual(card.why, card.how, "\(key) : le pourquoi et le comment sont deux phrases")
                if let gauge = card.gauge {
                    XCTAssertTrue((0...1).contains(gauge), "\(key) : une jauge hors de 0…1 (\(gauge))")
                }
                XCTAssertTrue(card.accessibilityLabel.contains(card.name) && card.accessibilityLabel.contains(card.value)
                    && card.accessibilityLabel.contains(card.why), "\(key) : VoiceOver dit concept, valeur et pourquoi")
            }
        }
    }

    func test_theSheetDevelopsTheCard_itNeverRephrasesIt() {
        for concept in ProgressionConcept.allCases {
            let texts = [ConceptText.why(concept), ConceptText.how(concept), ConceptText.tip1(concept), ConceptText.tip2(concept)]
            XCTAssertEqual(Set(texts).count, 4, "\(concept.rawValue) : la fiche redit une phrase de la carte au lieu de la développer")
            XCTAssertFalse(texts.contains(""), "\(concept.rawValue) : une phrase vide")
        }
    }

    // MARK: - Ce que les têtes disent

    func test_values_readTheServedBlock_neverACalculation() {
        let game = GameWave2Fixture.game()
        let served = progress(game)
        func value(_ concept: ProgressionConcept) -> String { ProgressionConceptModel.value(concept, progress: served, game: game) }

        XCTAssertEqual(value(.level), GameText.bannerLevel(level: GameCopy.formatCount(game.level.level)))
        XCTAssertEqual(value(.points), GameCopy.points(game.level.score))
        XCTAssertEqual(value(.meesh), GameCopy.meeshes(served.meesh?.balance ?? -1))
        XCTAssertEqual(value(.glory), GameCopy.rankLabel(game.glory.rank, division: game.glory.division))
        XCTAssertEqual(value(.flame), GameCopy.days(game.flame.days))
        XCTAssertEqual(value(.missions), ConceptText.ratio("0", "3"))
        XCTAssertEqual(value(.badges), ConceptText.ratio(GameCopy.formatCount(served.badgesEarned), GameCopy.formatCount(served.badgesTotal)))
        XCTAssertEqual(value(.showcase), GameText.doorShowcaseCount(count: 2))
        XCTAssertEqual(value(.atlas), ConceptText.ratio("1", GameCopy.formatCount(GameAtlas.total)))
    }

    func test_missions_lockedBelowLevelFive_sayTheLevel_notZeroOutOfThree() {
        let low = GameFixture.game(score: 0)
        XCTAssertFalse(low.missions.unlocked, "le témoin veut un jeu d'avant le niveau 5")

        let value = ProgressionConceptModel.value(.missions, progress: progress(low), game: low)

        XCTAssertEqual(value, GameText.doorLeagueLocked(level: GameCopy.formatCount(GameMissions.minLevel)))
    }

    func test_missions_aReadyChest_isAnImportantDatum() {
        let game = GameFixture.game(chestStatus: .ready)

        let chips = ProgressionConceptModel.chips(.missions, progress: progress(game), game: game)

        XCTAssertEqual(chips.first, ConceptText.chipChestReady, "le coffre prêt se lit dès la première page")
    }

    func test_flame_atRisk_putsTheWarningFirst() {
        let game = GameFixture.game(flameStatus: .atRisk)

        let chips = ProgressionConceptModel.chips(.flame, progress: progress(game), game: game)

        XCTAssertEqual(chips.first, GameCopy.flameStatus(.atRisk))
    }

    func test_league_locked_saysTheLevel_andOpen_saysTheRank() {
        let locked = GameWave2Fixture.game(league: GameWave2Fixture.league(access: .locked, current: nil))
        XCTAssertEqual(ProgressionConceptModel.value(.league, progress: progress(locked), game: locked),
                       GameText.doorLeagueLocked(level: GameCopy.formatCount(GameLeague.minLevel)))

        let open = GameWave2Fixture.game()
        XCTAssertEqual(ProgressionConceptModel.value(.league, progress: progress(open), game: open),
                       GameText.doorLeagueRank(league: GameText.leagueName(.jade), rank: "4", size: "12"))
    }

    // MARK: - Où j'en suis (fiche et tableau de bord)

    func test_everyServedConcept_hasFactsForItsSheetAndItsDashboardBlock() {
        let full = GameWave2Fixture.game()
        for (label, game) in [("jeu complet", Optional(full)), ("ancien serveur", nil)] {
            let served = progress(game)
            for concept in ProgressionConcepts.served(for: served, game: game) {
                let facts = ProgressionConceptModel.facts(concept, progress: served, game: game)
                XCTAssertFalse(facts.isEmpty, "\(concept.rawValue) (\(label)) : rien à lire dans « Où j'en suis »")
                XCTAssertEqual(Set(facts.map(\.label)).count, facts.count, "\(concept.rawValue) (\(label)) : un libellé en double")
                XCTAssertFalse(facts.contains { $0.label.isEmpty || $0.value.isEmpty }, "\(concept.rawValue) (\(label)) : une ligne vide")
            }
        }
    }

    // MARK: - Les sous-pages et les ancres

    func test_theConceptsWithAnExistingPage_linkToIt() {
        XCTAssertEqual(ProgressionConceptModel.links(.league).first, .page(.league))
        XCTAssertEqual(ProgressionConceptModel.links(.season).first, .page(.season))
        XCTAssertEqual(ProgressionConceptModel.links(.prestige).first, .page(.prestige))
        XCTAssertEqual(ProgressionConceptModel.links(.showcase).first, .page(.showcase))
        XCTAssertEqual(ProgressionConceptModel.links(.atlas).first, .page(.atlas))
        XCTAssertEqual(ProgressionConceptModel.links(.badges).first, .section(.badges))
        XCTAssertEqual(ProgressionConceptModel.links(.defis).first, .section(.defis))
        XCTAssertEqual(ProgressionConceptModel.links(.succes).first, .section(.succes))
        for concept in ProgressionConcept.allCases {
            let links = ProgressionConceptModel.links(concept)
            XCTAssertFalse(links.isEmpty, "\(concept.rawValue) : aucune sous-page")
            XCTAssertEqual(Set(links.map(\.id)).count, links.count)
            XCTAssertFalse(links.contains { $0.title.isEmpty })
        }
    }

    func test_theMissionAnnouncement_opensTheMissionsSheet() {
        XCTAssertEqual(ProgressionConceptModel.concept(for: .missions), .missions,
                       "le toucher de l'annonce d'une mission personnelle ouvre la FICHE des missions")
        XCTAssertEqual(ProgressionConceptModel.concept(for: .mint), .meesh)
        XCTAssertEqual(ProgressionConceptModel.concept(for: .flamePanel), .flame)
        XCTAssertEqual(ProgressionConceptModel.concept(for: .rank), .glory)
        XCTAssertEqual(ProgressionConceptModel.concept(for: .level), .level)
    }

    func test_thePhotoOffer_landsInTheSheetOfTheConceptItCelebrates() {
        XCTAssertEqual(ProgressionConceptModel.concept(for: .flame(.braise, days: 7)), .flame)
        XCTAssertEqual(ProgressionConceptModel.concept(for: .meesh(number: 10, edition: .silver)), .meesh)
        XCTAssertEqual(ProgressionConceptModel.concept(for: .leagueUp(.jade)), .league)
        XCTAssertEqual(ProgressionConceptModel.concept(for: .achievement), .succes)
    }

    // MARK: - Les gestes vivent dans les fiches

    func test_theGestures_existOnlyWhereTheConceptHasSomethingToDo() {
        let game = GameWave2Fixture.game()
        for concept in [ProgressionConcept.points, .meesh, .flame, .missions, .league, .elans, .badges, .succes] {
            XCTAssertTrue(ProgressionConceptGestures.exist(for: concept, game: game), "\(concept.rawValue) : sa fiche porte un geste")
        }
        XCTAssertFalse(ProgressionConceptGestures.exist(for: .missions, game: nil), "sans jeu, pas de missions à jouer")
        XCTAssertTrue(ProgressionConceptGestures.exist(for: .level, game: nil), "devant un ancien serveur, la fiche du niveau garde ses paliers")
    }
}
