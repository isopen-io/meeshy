import XCTest
@testable import Meeshy
import MeeshySDK

/// **Chaque concept servi a sa carte et sa fiche** (#9564) — la première page et les fiches PARCOURENT
/// `ProgressionConcepts.served` et lisent `ProgressionConceptModel`, où les trois règles de dédoublonnage sont posées
/// une fois (amendement n° 4). Ces témoins interrogent la loi, pas le rendu : ce qu'un concept dit ne dépend
/// d'aucune vue.
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
        XCTAssertEqual(value(.glory), GameCopy.rankLabel(game.glory))
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

        let card = ProgressionConceptModel.card(.missions, progress: progress(game), game: game)

        XCTAssertEqual(card.chips.first, ConceptText.chipChestReady, "le coffre prêt se lit dès la première page")
        XCTAssertTrue(card.urgent, "le coffre prêt est la pastille d'action, teintée")
        XCTAssertEqual(card.chips.filter { $0 == ConceptText.chipChestReady }.count, 1, "une seule fois")
    }

    func test_flame_atRisk_putsTheWarningFirst() {
        let game = GameFixture.game(flameStatus: .atRisk)

        let card = ProgressionConceptModel.card(.flame, progress: progress(game), game: game)

        XCTAssertEqual(card.chips.first, GameCopy.flameStatus(.atRisk))
        XCTAssertTrue(card.urgent)
        let calm = GameFixture.game(flameStatus: .lit)
        XCTAssertFalse(ProgressionConceptModel.card(.flame, progress: progress(calm), game: calm).urgent, "une Flamme qui brûle ne demande rien")
    }

    func test_league_locked_saysTheLevel_andOpen_saysTheRank() {
        let locked = GameWave2Fixture.game(league: GameWave2Fixture.league(access: .locked, current: nil))
        XCTAssertEqual(ProgressionConceptModel.value(.league, progress: progress(locked), game: locked),
                       GameText.doorLeagueLocked(level: GameCopy.formatCount(GameLeague.minLevel)))

        let open = GameWave2Fixture.game()
        XCTAssertEqual(ProgressionConceptModel.value(.league, progress: progress(open), game: open), GameText.leagueName(.jade),
                       "la valeur est le nom de la ligue ; la place est une pastille (règle n° 2)")
        XCTAssertTrue(ProgressionConceptModel.card(.league, progress: progress(open), game: open).chips
            .contains(GameText.leagueRankLine(rank: "4", size: "12")))
    }

    // MARK: - Où j'en suis : les trois règles de dédoublonnage (amendement n° 4)

    func test_theFactsOfASheet_areWellFormed_andNeverRepeatTheHeadValue() {
        let full = GameWave2Fixture.game()
        for (label, game) in [("jeu complet", Optional(full)), ("jeu sans vague 2", Optional(GameFixture.game())), ("ancien serveur", nil)] {
            let served = progress(game)
            for concept in ProgressionConcepts.served(for: served, game: game) {
                let facts = ProgressionConceptModel.facts(concept, progress: served, game: game)
                let head = ProgressionConceptModel.value(concept, progress: served, game: game)
                XCTAssertEqual(Set(facts.map(\.label)).count, facts.count, "\(concept.rawValue) (\(label)) : un libellé en double")
                XCTAssertFalse(facts.contains { $0.label.isEmpty || $0.value.isEmpty }, "\(concept.rawValue) (\(label)) : une ligne vide")
                XCTAssertFalse(facts.contains { $0.value == head }, "\(concept.rawValue) (\(label)) : une ligne redit la valeur de tête (règle n° 2)")
                if [ProgressionConcept.level, .points, .league].contains(concept) {
                    XCTAssertFalse(facts.contains { $0.label == ConceptText.name(concept) },
                                   "\(concept.rawValue) (\(label)) : « \(ConceptText.name(concept)) : … » sous la tête (règle n° 2)")
                }
            }
        }
    }

    func test_rule1_eachSharedDatum_hasOneOwner() {
        XCTAssertEqual(ProgressionConceptModel.owner(of: .score), .points)
        XCTAssertEqual(ProgressionConceptModel.owner(of: .mintMissing), .points)
        XCTAssertEqual(ProgressionConceptModel.owner(of: .factor), .elans)
        XCTAssertEqual(ProgressionConceptModel.owner(of: .prestigeStars), .prestige)
        XCTAssertEqual(ProgressionConceptModel.owner(of: .mintPrice), .meesh)
        let all = Set(ProgressionConcept.allCases)
        for datum in ProgressionSharedDatum.allCases {
            let owner = ProgressionConceptModel.owner(of: datum)
            XCTAssertEqual(ProgressionConcept.allCases.filter { ProgressionConceptModel.says(datum, in: $0, served: all) }, [owner],
                           "\(datum) : une donnée se dit dans UN concept quand tous sont servis")
            XCTAssertTrue(ProgressionConceptModel.says(datum, in: .level, served: all.subtracting([owner])),
                          "\(datum) : son propriétaire absent (ancien serveur), un autre concept la garde")
        }
    }

    func test_rule1_theScoreLeavesTheLevel_andWhatIsMissingToMintLeavesTheMeeshes() {
        let poor = GameFixture.game(score: 400, debitable: 400, held: 0)
        XCTAssertFalse(poor.mint.canMint, "le témoin veut une frappe impossible")
        let served = progress(poor, meesh: GameFixture.meesh(balance: 0, minted: 0, debitable: 400))

        XCTAssertFalse(ProgressionConceptModel.facts(.level, progress: served, game: poor).contains { $0.detail == .score },
                       "le score est aux Points")
        XCTAssertTrue(ProgressionConceptModel.facts(.points, progress: served, game: poor).contains { $0.detail == .mintMissing },
                      "ce qui manque pour frapper est aux Points")
        XCTAssertFalse(ProgressionConceptModel.facts(.meesh, progress: served, game: poor).contains { $0.detail == .mintMissing })
        XCTAssertFalse(ProgressionConceptModel.chips(.meesh, progress: served, game: poor)
            .contains(ConceptText.chipMissing(GameCopy.points(poor.mint.missingPoints))), "la carte des Meeshes ne redit pas ce qui manque")
        XCTAssertFalse(ProgressionConceptModel.chips(.points, progress: served, game: poor)
            .contains(GameText.bannerLevel(level: GameCopy.formatCount(poor.level.level))), "la carte des Points ne redit pas le niveau")

        let old = progress(nil)
        XCTAssertTrue(ProgressionConceptModel.chips(.level, progress: old, game: nil).contains(GameCopy.points(old.level.scale.value)),
                      "devant un ancien serveur, sans carte des Points, le niveau garde le score")
    }

    func test_rule3_aGamePiece_replacesTheHero_andTheSheetDoesNotRepeatIt() {
        let game = GameWave2Fixture.game()
        let served = progress(game)
        func facts(_ concept: ProgressionConcept) -> [ProgressionConceptFact] {
            ProgressionConceptModel.facts(concept, progress: served, game: game)
        }
        for concept in [ProgressionConcept.level, .meesh, .league, .elans] {
            XCTAssertTrue(ProgressionConceptGestures.isHero(for: concept, progress: served, game: game), "\(concept.rawValue) : sa pièce est son héros")
        }
        XCTAssertFalse(facts(.level).contains { [.tier, .levelNext, .levelRecord, .score].contains($0.detail) },
                       "l'anneau du niveau dit déjà palier, reste et record")
        XCTAssertFalse(facts(.meesh).contains { [.mintPrice, .mintNext, .mintMissing].contains($0.detail) }, "la frappe dit déjà la pièce et son prix")
        XCTAssertFalse(facts(.league).contains { [.weekPoints, .leagueCloses, .leaguePlace].contains($0.detail) }, "le détail de ligue dit déjà la place, la semaine et la fermeture")
        XCTAssertTrue(facts(.elans).isEmpty, "les Élans disent tout dans leur pièce")
        XCTAssertFalse(ProgressionConceptGestures.isHero(for: .points, progress: served, game: game), "les Points n'ont pas de pièce : le héros générique")
    }

    func test_theCard_showsFirstWhatAsksForAnAction() {
        let rich = GameFixture.game()
        XCTAssertTrue(rich.mint.canMint, "le témoin veut une frappe possible")
        let card = ProgressionConceptModel.card(.meesh, progress: progress(rich), game: rich)
        XCTAssertEqual(card.chips.first, ConceptText.chipMintReady, "la frappe possible se lit en premier sur la carte des Meeshes")
        XCTAssertTrue(card.urgent)
        for concept in [ProgressionConcept.level, .points, .glory, .badges] {
            XCTAssertFalse(ProgressionConceptModel.card(concept, progress: progress(rich), game: rich).urgent, "\(concept.rawValue) : rien à faire")
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
            XCTAssertLessThanOrEqual(links.count, 1, "\(concept.rawValue) : sa sous-page, et elle seule (amendement n° 4)")
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
        let served = progress(game)
        for concept in [ProgressionConcept.level, .points, .meesh, .flame, .missions, .league, .elans, .badges, .succes] {
            XCTAssertTrue(ProgressionConceptGestures.exist(for: concept, progress: served, game: game), "\(concept.rawValue) : sa fiche porte un geste")
        }
        let old = progress(nil)
        XCTAssertFalse(ProgressionConceptGestures.exist(for: .missions, progress: old, game: nil), "sans jeu, pas de missions à jouer")
        XCTAssertTrue(ProgressionConceptGestures.exist(for: .level, progress: old, game: nil), "devant un ancien serveur, la fiche du niveau garde ses paliers")
        XCTAssertFalse(ProgressionConceptGestures.exist(for: .meesh, progress: progress(nil, meesh: nil), game: nil), "sans solde servi, pas de frappe")
    }
}
