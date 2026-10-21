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

    func test_cards_beforeSeasonOne_saysWhenItOpens_neverAVoid() {
        let game = GameWave2Fixture.game(season: nil, seasonUpcoming: GameWave2Fixture.upcoming)
        let cards = ProgressionConceptModel.cards(progress: progress(game), game: game, now: localDate(2026, 10, 11, 12, 0))

        let season = cards.first { $0.concept == .season }
        XCTAssertEqual(season?.value, GameText.doorSeasonUpcoming(date: GameWave2Format.day("2026-12-21")),
                       "avant le lundi 2026-12-21 (#10014), la ligne annonce l'ouverture")
        XCTAssertNotEqual(season?.value, GameText.doorSeasonNone)
    }

    // MARK: - La porte bascule d'elle-même le jour de l'ouverture (#10224)

    private func localDate(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)) ?? Date()
    }

    func test_seasonDoor_offlineCopy_stillUpcoming_theMinuteBeforeSundayEightPm() {
        let game = GameWave2Fixture.game(season: nil, seasonUpcoming: GameWave2Fixture.upcoming)
        let value = ProgressionConceptModel.value(.season, progress: progress(game), game: game, now: localDate(2026, 12, 20, 19, 59))
        XCTAssertEqual(value, GameText.doorSeasonUpcoming(date: GameWave2Format.day("2026-12-21")))
    }

    func test_seasonDoor_offlineCopy_opensItself_atTheSundayEightPmClose() {
        // Hors ligne, le bloc gardé porte encore `seasonUpcoming` : la porte calcule son état (`GameSeason.liveTense`).
        let game = GameWave2Fixture.game(season: nil, seasonUpcoming: GameWave2Fixture.upcoming)
        let cards = ProgressionConceptModel.cards(progress: progress(game), game: game, now: localDate(2026, 12, 20, 20, 0))
        let season = cards.first { $0.concept == .season }
        XCTAssertEqual(season?.value, GameText.doorSeason(number: GameCopy.formatCount(1)), "le jour J, la porte dit la saison ouverte")
        XCTAssertNotEqual(season?.value, GameText.doorSeasonUpcoming(date: GameWave2Format.day("2026-12-21")))
        let monday = ProgressionConceptModel.value(.season, progress: progress(game), game: game, now: localDate(2026, 12, 21, 9, 0))
        XCTAssertEqual(monday, GameText.doorSeason(number: GameCopy.formatCount(1)))
    }

    func test_upcomingSeasonLine_namesTheNumberAndTheMonday() {
        let line = GameSeasonUpcoming.line(GameWave2Fixture.upcoming, locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(line.contains("1"), line)
        XCTAssertTrue(line.contains("21"), line)
        XCTAssertTrue(line.lowercased().contains("décembre"), line)
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
            .contains(ConceptText.chipToMeesh(number: GameCopy.formatCount(poor.mint.number), missing: GameCopy.formatCount(poor.mint.missingPoints))),
                       "la carte des Meeshes ne redit pas ce qui manque")
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
        XCTAssertEqual(ProgressionConceptModel.concept(for: .achievement(rarity: nil)), .succes)
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

    // MARK: - La phrase d'état (#10540)
    //
    // Retour du porteur : « j'ai 77 099 points, il te manque 1 839 points, points à convertir 5 823, niveau 27 ». Trois
    // chiffres justes, qui mesurent trois choses, et aucun ne disait laquelle. Les cas chiffrés sont ceux du témoin
    // web (`apps/web/src/lib/view/progression-state.test.ts`) ; chaque attente est composée par le catalogue, donc
    // juste dans toute langue d'appareil.

    /// Le compte du porteur, mesuré en production le 2026-10-13 : niveau 27, 78 Meeshes frappées, 3 gardées.
    private let jcnm = GameFixture.game(score: 77_099, levelRecord: 27, minted: 78, debitable: 5_823, held: 3)
    private var jcnmWallet: APIEngagementProgress.Meesh { GameFixture.meesh(balance: 3, minted: 78, debitable: 5_823) }

    private func state(_ concept: ProgressionConcept, _ game: GameBlock?, meesh: APIEngagementProgress.Meesh? = GameFixture.meesh()) -> String? {
        ProgressionConceptModel.state(concept, progress: progress(game, meesh: meesh), game: game)
    }

    private func n(_ value: Int) -> String { GameCopy.formatCount(value) }

    func test_state_theOwnersAccount_readsTheLawItWasBuiltFrom() {
        XCTAssertEqual(jcnm.level.shown.level, 27)
        XCTAssertEqual(jcnm.level.shown.pointsToNext, 1_301, "le reste vers le niveau 28 : 78 400 − 77 099")
        XCTAssertEqual(jcnm.mint.number, 79)
        XCTAssertEqual(jcnm.mint.price, 7_662)
        XCTAssertEqual(jcnm.mint.missingPoints, 1_839, "le manque vise la Meesh : 7 662 − 5 823")
    }

    func test_state_level_saysWhatIsDoneInThisLevel_andWhatRemainsForTheNext() {
        XCTAssertEqual(state(.level, jcnm, meesh: jcnmWallet), ConceptText.stateLevelProgress(
            level: n(27), done: GameCopy.points(4_199), span: n(5_500), left: n(1_301), next: n(28)
        ))
    }

    func test_state_points_nameTheTwoBalances_andTheMissingAmountAimsAtTheCoin() {
        XCTAssertEqual(state(.points, jcnm, meesh: jcnmWallet), ConceptText.statePointsMissing(
            held: GameCopy.points(77_099), convertible: GameCopy.convertiblePoints(5_823), number: n(79),
            price: GameCopy.points(7_662), missing: GameCopy.convertiblePoints(1_839)
        ))
    }

    /// Les étincelles (#10846) : UN seul solde — la poche, toute convertible. La phrase ne redit plus deux fois le
    /// même nombre, et lit la POCHE, jamais le cycle (`score`).
    func test_state_points_underSparks_saysTheSinglePocket() {
        let base = jcnm
        let level = GameBlock.Level(level: base.level.level, tier: base.level.tier, score: 77_099, floorScore: base.level.floorScore,
                                    nextThreshold: base.level.nextThreshold, pointsToNext: base.level.pointsToNext,
                                    progress: base.level.progress, record: base.level.record, prestige: 0, canPrestige: false,
                                    ladder: base.level.ladder, sparks: 5_823, sparksCycle: 77_099, sparksLifetime: 90_000)
        let sparked = GameBlock(level: level, glory: base.glory, treasury: base.treasury, mint: base.mint, missions: base.missions,
                                chest: base.chest, flame: base.flame, boosts: base.boosts, guideSeen: base.guideSeen,
                                wave2: base.wave2)
        XCTAssertEqual(state(.points, sparked, meesh: jcnmWallet), ConceptText.statePointsMissingPlain(
            held: GameCopy.points(5_823), number: n(79), price: GameCopy.points(7_662), missing: GameCopy.points(1_839)
        ))
    }

    func test_state_meesh_saysWhatIsKept_whatWasMinted_andWhatTheNextAsks() {
        let kept = ConceptText.stateMeeshKept(balance: GameCopy.meeshes(3), minted: n(78))
        let next = ConceptText.stateMeeshNextMissing(number: n(79), price: GameCopy.points(7_662), missing: GameCopy.convertiblePoints(1_839))
        XCTAssertEqual(state(.meesh, jcnm, meesh: jcnmWallet), kept + " " + next)

        let none = GameFixture.game(score: 400, debitable: 400, held: 0)
        let empty = state(.meesh, none, meesh: GameFixture.meesh(balance: 0, minted: 0, debitable: 400)) ?? ""
        XCTAssertTrue(empty.hasPrefix(ConceptText.stateMeeshKeptNone(minted: n(0))), "aucune Meesh gardée ne se dit pas « 0 Meesh » : \(empty)")
    }

    func test_state_1301and1839_noLongerMix_eachCarriesItsTarget() {
        let level = state(.level, jcnm, meesh: jcnmWallet) ?? ""
        let points = state(.points, jcnm, meesh: jcnmWallet) ?? ""
        XCTAssertTrue(level.contains(n(1_301)) && level.contains(n(28)), level)
        XCTAssertFalse(level.contains(n(1_839)), level)
        XCTAssertTrue(points.contains(n(1_839)) && points.contains(n(79)), points)
        XCTAssertFalse(points.contains(n(1_301)), points)
    }

    func test_state_levelHeldByAStep_saysTheStep_neverZeroRemaining() throws {
        let held = GameFixture.game(score: GameLevels.threshold(of: 25), glory: 0,
                                    steps: GameLevelStepCounts(minted: 1, missionsDone: 0, flameRecord: 0))
        XCTAssertTrue(held.level.shown.held, "le témoin veut un niveau retenu par une étape")
        let step = try XCTUnwrap(held.level.shown.step)
        XCTAssertEqual(step.level, 20)
        XCTAssertEqual(state(.level, held), GameCopy.levelHeld(step))
    }

    func test_state_oldServer_keepsTheTargetOfWhatRemains_andInventsNothing() {
        let old = progress(nil)
        let next = old.level.scale.nextThreshold ?? 0
        XCTAssertEqual(ProgressionConceptModel.state(.level, progress: old, game: nil), ConceptText.stateLevelSimple(
            level: n(old.level.level), left: GameCopy.points(next - old.level.scale.value), next: n(old.level.level + 1)
        ))
        XCTAssertEqual(ProgressionConceptModel.state(.flame, progress: old, game: nil),
                       ConceptText.stateFlameStreak(days: GameCopy.days(4), record: GameCopy.days(9)))
        for concept in [ProgressionConcept.points, .meesh, .glory, .missions, .league, .season, .prestige, .showcase, .atlas] {
            XCTAssertNil(ProgressionConceptModel.state(concept, progress: old, game: nil), "\(concept.rawValue) : rien n'est servi, rien ne se dit")
        }
    }

    func test_state_points_enoughToMint_saySo_withoutAnyMissing() {
        let rich = GameFixture.game()
        XCTAssertTrue(rich.mint.canMint, "le témoin veut une frappe possible")
        XCTAssertEqual(state(.points, rich), ConceptText.statePointsReady(
            held: GameCopy.points(rich.level.score), convertible: GameCopy.convertiblePoints(121_800),
            number: n(rich.mint.number), price: GameCopy.points(rich.mint.price)
        ))
        // Sans porte-monnaie servi et frappe possible : le solde à convertir reste inconnu, jamais déduit du score.
        XCTAssertNil(ProgressionConceptModel.convertiblePoints(progress: progress(rich, meesh: nil), game: rich))
        XCTAssertEqual(state(.points, rich, meesh: nil), ConceptText.statePointsReadyPlain(
            held: GameCopy.points(rich.level.score), number: n(rich.mint.number), price: GameCopy.points(rich.mint.price)
        ))
    }

    func test_state_withoutAServedWallet_theConvertibleBalanceComesFromThePriceAndTheMissing_neverFromTheScore() {
        XCTAssertEqual(ProgressionConceptModel.convertiblePoints(progress: progress(jcnm, meesh: nil), game: jcnm), 5_823)
        XCTAssertEqual(ProgressionConceptModel.convertiblePoints(progress: progress(jcnm, meesh: jcnmWallet), game: jcnm), 5_823)
        XCTAssertTrue(state(.points, jcnm, meesh: nil)?.contains(GameCopy.convertiblePoints(5_823)) ?? false)
    }

    func test_state_flame_saysTheStepItIsAt() {
        let risky = GameFixture.game(flameDays: 6, flameStatus: .atRisk)
        XCTAssertEqual(state(.flame, risky), ConceptText.stateFlameAtRisk(days: GameCopy.days(6)))
        let lit = GameFixture.game(flameDays: 6, flameStatus: .lit, freezes: 1)
        XCTAssertEqual(state(.flame, lit), ConceptText.stateFlameLit(
            days: GameCopy.days(6), bonus: n(lit.flame.bonusPercent), freezes: ConceptText.ratio(n(1), n(2))
        ))
        XCTAssertEqual(lit.flame.bonusPercent, 12, "six jours : 12 % de plus, lu sur la loi")
        XCTAssertEqual(state(.flame, GameFixture.game(flameDays: 6, flameStatus: .covered)), ConceptText.stateFlameCovered(days: GameCopy.days(6)))
        XCTAssertEqual(state(.flame, GameFixture.game(flameDays: 0, flameStatus: .out)), ConceptText.stateFlameOut)
        XCTAssertEqual(state(.flame, GameFixture.game(flameDays: 0, flameStatus: .none)), ConceptText.stateFlameNone)
    }

    func test_state_missions_sayHowManyAreDone_andWhatRemainsForTheChest() {
        let one = GameFixture.game(missions: [GameFixture.mission(id: "m1", completed: true), GameFixture.mission(id: "m2"), GameFixture.mission(id: "m3")])
        XCTAssertEqual(state(.missions, one), ConceptText.stateMissionsProgress(done: n(1), total: n(3), left: n(2)))
        let all = [GameFixture.mission(id: "m1", completed: true), GameFixture.mission(id: "m2", completed: true), GameFixture.mission(id: "m3", completed: true)]
        XCTAssertEqual(state(.missions, GameFixture.game(missions: all, chestStatus: .ready)), ConceptText.stateMissionsReady(done: n(3), total: n(3)))
        XCTAssertEqual(state(.missions, GameFixture.game(missions: all, chestStatus: .claimed)), ConceptText.stateMissionsClaimed(done: n(3), total: n(3)))

        let early = GameFixture.game(score: 400)
        XCTAssertFalse(early.missions.unlocked, "le témoin veut un jeu d'avant le niveau 5")
        XCTAssertEqual(state(.missions, early), GameCopy.missionsLocked(level: n(early.level.shown.level)))
    }

    func test_state_league_saysThePlace_theWeekPoints_andTheZoneWithItsTarget() {
        let top = GameWave2Fixture.game()
        let place = ConceptText.stateLeaguePlace(league: GameText.leagueName(.jade), rank: n(4), size: n(12), points: GameCopy.points(410))
        XCTAssertEqual(state(.league, top), place + " " + ConceptText.stateLeagueZonePromotion)

        func placed(_ zone: LeagueZone, missing: Int?) -> GameBlock {
            GameWave2Fixture.game(league: GameWave2Fixture.league(current: .init(
                league: .jade, groupId: "g", groupSize: 12, rank: 4, weekPoints: 410, zone: zone, cup: nil, pointsToPromotion: missing
            )))
        }
        XCTAssertEqual(state(.league, placed(.safe, missing: 120)), place + " " + ConceptText.stateLeagueZoneSafe(missing: GameCopy.points(120)))
        XCTAssertEqual(state(.league, placed(.relegation, missing: 300)), place + " " + ConceptText.stateLeagueZoneRelegation(missing: GameCopy.points(300)))
        XCTAssertEqual(state(.league, placed(.safe, missing: nil)), place, "sans manque servi, la zone ne s'invente pas")

        let locked = GameWave2Fixture.game(league: GameWave2Fixture.league(access: .locked, current: nil))
        XCTAssertEqual(state(.league, locked), GameText.leagueLocked(level: n(GameLeague.minLevel), current: n(locked.level.shown.level)))
        let unplaced = GameWave2Fixture.game(league: GameWave2Fixture.league(current: nil))
        XCTAssertEqual(state(.league, unplaced), ConceptText.stateLeagueUnplaced)
    }

    func test_state_season_saysTheWeek_theStep_andWhatIsMissingForTheNext() throws {
        let game = GameWave2Fixture.game()
        let season = try XCTUnwrap(game.season)
        XCTAssertEqual(state(.season, game), ConceptText.stateSeasonProgress(
            number: n(season.number), week: n(season.week), weeks: n(GameSeason.weeks), steps: n(season.steps),
            total: n(season.stepsTotal), stars: GameText.seasonStars(count: season.starsToNext)
        ))
        XCTAssertEqual(state(.season, GameWave2Fixture.game(season: nil)), GameText.seasonNone)
    }

    func test_state_prestige_saysWhereItOpens_andWhereYouAre() {
        let game = GameWave2Fixture.game()
        XCTAssertEqual(state(.prestige, game), GameText.prestigeLocked(level: n(game.level.shown.level)))
        XCTAssertEqual(state(.prestige, GameWave2Fixture.atLevel100()), GameText.prestigeMee)
    }

    func test_state_theCountedConcepts_theShowcaseAndTheAtlas_sayWhereTheyStand() {
        let game = GameWave2Fixture.game()
        let served = progress(game)
        XCTAssertEqual(state(.badges, game), served.badgesEarned >= served.badgesTotal
            ? ConceptText.stateCountComplete(done: n(served.badgesEarned), total: n(served.badgesTotal))
            : ConceptText.stateCountBadges(done: n(served.badgesEarned), total: n(served.badgesTotal), left: n(served.badgesTotal - served.badgesEarned)))
        XCTAssertEqual(state(.showcase, game), ConceptText.stateShowcaseCount(
            trophies: GameText.doorShowcaseCount(count: 2), who: GameText.visibilityLabel(.friends)
        ))
        XCTAssertEqual(state(.atlas, game), ConceptText.stateAtlasProgress(stamped: n(1), total: n(GameAtlas.total), pending: n(1)))
    }

    /// Chaque concept dont la donnée est servie a SA phrase : jamais vide, jamais un trou de chaîne resté nu, et la
    /// carte comme le lecteur d'écran lisent la même. Les Élans et les défis n'en ont que si leur donnée est servie.
    func test_state_everyServedConcept_hasItsSentence_andTheCardCarriesIt() {
        let alwaysSaid: Set<ProgressionConcept> = [.level, .points, .meesh, .glory, .flame, .missions, .league, .season, .prestige,
                                                   .badges, .succes, .showcase, .atlas]
        let cases: [(String, GameBlock, APIEngagementProgress.Meesh)] = [
            ("jeu complet", GameWave2Fixture.game(), GameFixture.meesh()), ("compte du porteur", jcnm, jcnmWallet),
        ]
        for (label, game, wallet) in cases {
            let served = progress(game, meesh: wallet)
            for card in ProgressionConceptModel.cards(progress: served, game: game) {
                let key = "\(card.concept.rawValue) (\(label))"
                let line = ProgressionConceptModel.state(card.concept, progress: served, game: game)
                XCTAssertEqual(card.state, line, "\(key) : la carte lit la phrase de la loi")
                if alwaysSaid.contains(card.concept) {
                    XCTAssertNotNil(line, "\(key) : pas de phrase d'état")
                }
                guard let line else { continue }
                XCTAssertFalse(line.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) : une phrase d'état vide")
                for naked in ["%@", "%1$", "%2$", "%3$", "%%", "{", "game."] {
                    XCTAssertFalse(line.contains(naked), "\(key) : « \(naked) » nu dans « \(line) »")
                }
                XCTAssertTrue(card.accessibilityLabel.contains(line), "\(key) : VoiceOver dit aussi la phrase d'état")
            }
        }
    }

    func test_state_elans_sayNothingUnserved_andTheServedOnesSayTheFamilies() {
        let game = GameFixture.game()
        let served = progress(game)
        let line = ProgressionConceptModel.state(.elans, progress: served, game: game)
        guard let elan = served.elan else {
            XCTAssertNil(line, "sans élan servi, aucune phrase ne s'invente")
            return
        }
        let families = ProgressionConceptModel.families(elan.activeFamilyCount)
        XCTAssertEqual(line, elan.isAccelerated
            ? ConceptText.stateElansActive(factor: GameCopy.factor(elan.factor), families: families)
            : ConceptText.stateElansIdle(families: families))
    }

    /// Quatre questions par concept : ce que c'est, à quoi ça sert, comment ça marche, comment s'en servir — quatre
    /// phrases, jamais une répétée.
    func test_everyConcept_answersFourQuestions() {
        for concept in ProgressionConcept.allCases {
            let texts = [ConceptText.what(concept), ConceptText.why(concept), ConceptText.how(concept), ConceptText.use(concept)]
            XCTAssertEqual(Set(texts).count, 4, "\(concept.rawValue) : une question reçoit la réponse d'une autre")
            XCTAssertFalse(texts.contains(""), "\(concept.rawValue) : une question sans réponse")
        }
    }

    /// Les pastilles et les lignes de la carte nomment leur cible : le niveau visé, la pièce visée, le rang visé.
    func test_theChipsAndTheFacts_nameTheTargetOfWhatIsMissing() {
        let served = progress(jcnm, meesh: jcnmWallet)
        XCTAssertTrue(ProgressionConceptModel.chips(.level, progress: served, game: jcnm)
            .contains(ConceptText.chipToLevel(level: n(28), points: GameCopy.points(1_301))))
        XCTAssertEqual(ProgressionConceptModel.chips(.points, progress: served, game: jcnm), [
            GameCopy.convertiblePoints(5_823), ConceptText.chipToMeesh(number: n(79), missing: n(1_839)),
        ])
        let facts = ProgressionConceptModel.facts(.points, progress: served, game: jcnm)
        XCTAssertEqual(facts, [
            ProgressionConceptFact(label: ConceptText.factConvertible, value: GameCopy.points(5_823), detail: .convertible),
            ProgressionConceptFact(label: ConceptText.missingForMeesh(number: n(79)), value: GameCopy.convertiblePoints(1_839), detail: .mintMissing),
        ])
        let rich = GameFixture.game()
        XCTAssertTrue(ProgressionConceptModel.chips(.points, progress: progress(rich), game: rich).contains(ConceptText.chipMintCovered))
        let glory = ProgressionConceptModel.facts(.glory, progress: served, game: jcnm)
        XCTAssertEqual(glory.first { $0.detail == .gloryMissing }?.label,
                       jcnm.glory.next.map { ConceptText.missingForRank(rank: GameCopy.rankLabel($0.rank, division5: $0.shownDivision)) })
    }

    // MARK: - Le Vent arrière (#10896)

    /// Le Vent arrière ne se dit aux Élans que quand il souffle : la passerelle sert `tailwind > 1` à 7 niveaux ou plus
    /// sous le record de niveau, et 1 sinon — un « ×1 » ne se montre jamais.
    func test_theTailwind_isSaidByTheElans_onlyWhileItBlows() {
        let game = GameFixture.game()
        func tailwind(_ factor: Double) -> ProgressionConceptFact? {
            let windy = game.replacing(boosts: game.boosts.replacing(tailwind: factor))
            return ProgressionConceptModel.facts(.elans, progress: progress(windy), game: windy).first { $0.detail == .tailwind }
        }
        XCTAssertNil(tailwind(1), "le Vent arrière éteint ne se dit pas")
        let blowing = try? XCTUnwrap(tailwind(1.25))
        XCTAssertEqual(blowing?.label, GameRulesGlossary.name(.tailwind))
        XCTAssertEqual(blowing?.value, ConceptText.valueFactor(GameCopy.factor(1.25)))
    }
}
