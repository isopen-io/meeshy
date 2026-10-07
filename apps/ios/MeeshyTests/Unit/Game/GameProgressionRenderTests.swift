import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// **Ce que l'utilisateur VOIT, pas ce que le code déclare** (#9383, #9564) — la première page de Progression ne
/// porte que des CARTES de concept ; les gestes du jeu sont RENDUS dans la fiche de leur concept ; le tableau de
/// bord a un bloc par concept. Une vue écrite et montée par personne ne fait rougir aucun compilateur.
@MainActor
final class GameProgressionRenderTests: XCTestCase {

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    /// Combien de fois un motif paraît dans les sources du jeu (hors tests) : la garde d'unicité, indépendante du harnais.
    private func sourceCount(of needle: String) throws -> Int {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Game")
        let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" } ?? []
        return try files.reduce(0) { total, file in
            total + (try String(contentsOf: file, encoding: .utf8)).components(separatedBy: needle).count - 1
        }
    }

    private func loadedViewModel(_ payload: APIEngagementProgress) async -> ProgressionViewModel {
        let service = MockEngagementProgressService()
        service.fetchProgressResult = .success(payload)
        let vm = ProgressionViewModel(
            service: service,
            gameService: MockGameService(),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: "game-render-\(UUID().uuidString)",
            notebook: MockGamePhotoNotebook()
        )
        await vm.load(forceNetwork: true)
        return vm
    }

    /// Tout tient dans la fenêtre : aucun élément n'est hors cadre, donc aucun n'est élagué de l'arbre.
    @discardableResult
    private func monter(_ vue: some View) -> RenderedScreen {
        let e = RenderedScreen(vue, size: CGSize(width: 402, height: 6400))
        ecran = e
        return e
    }

    /// Les identifiants des GESTES du jeu : aucun ne doit paraître hors de la fiche de son concept. (Le compteur
    /// de Meeshes, lui, a retrouvé l'en-tête de la première page — `ProgressionChromeGuardTests`.)
    private static let gestures = [
        "game.mission.m1", "game.chest.ready", "game.mint.action", "game.mint.hero", "game.flame.freeze.buy",
        "game.flame.relight", "game.hero",
    ]

    private func fullGame(chest: GameBlock.Chest.Status = .ready) -> GameBlock {
        GameFixture.game(chestStatus: chest).replacing(wave2: GameWave2Fixture.game().wave2)
    }

    // MARK: - La première page : des cartes, rien d'autre

    func test_theFrontPage_carriesOneCardPerServedConcept() async {
        let vm = await loadedViewModel(GameFixture.snapshot(fullGame()))
        XCTAssertNotNil(vm.game, "le modèle n'a pas le bloc : ce n'est pas la vue qui est en cause")

        let ecran = monter(ProgressionView(viewModel: vm))
        let identifiants = ecran.identifiers

        // L'ORDRE est gardé par la loi (`ProgressionConceptModelTests`) : le harnais ne promet pas celui de l'arbre.
        XCTAssertEqual(Set(identifiants.filter { $0.hasPrefix("progression.concept.") }),
                       Set(ProgressionConcept.allCases.map { "progression.concept.\($0.rawValue)" }),
                       "une carte par concept servi, ni plus ni moins. Vus : \(identifiants)")
        for attendu in ["progression.dashboard", "game.guide.line", "game.door.notebook", "game.door.rules", "game.door.settings"] {
            XCTAssertTrue(identifiants.contains(attendu), "« \(attendu) » n'est pas dans l'arbre rendu. Vus : \(identifiants)")
        }
    }

    func test_theFrontPage_carriesNoGestureNorGauge_onlyCards() async {
        let vm = await loadedViewModel(GameFixture.snapshot(fullGame()))

        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers

        for geste in Self.gestures {
            XCTAssertFalse(identifiants.contains(geste), "« \(geste) » est sur la première page : les gestes vivent dans les fiches")
        }
        XCTAssertFalse(identifiants.contains { $0.hasPrefix("game.hero.earn.") }, "les puces « Comment gagner » sont dans la fiche du niveau")
        XCTAssertFalse(identifiants.contains("game.guide.card"), "Mee ne dit qu'UNE ligne ici ; son message entier s'ouvre au toucher")
    }

    /// L'amendement porteur : sous la tête, les données importantes, puis le pourquoi et le comment — et UN seul
    /// élément d'accessibilité par carte, qui dit concept, valeur et pourquoi.
    func test_eachCard_saysItsConceptItsValueAndItsWhy_toVoiceOver() async {
        let game = fullGame()
        let vm = await loadedViewModel(GameFixture.snapshot(game))
        let ecran = monter(ProgressionView(viewModel: vm))
        let progress = EngagementProgressResolver.resolve(GameFixture.snapshot(game))

        for card in ProgressionConceptModel.cards(progress: progress, game: game) {
            let dit = ecran.node("progression.concept.\(card.concept.rawValue)")?.label ?? ""
            XCTAssertTrue(dit.contains(card.name), "\(card.concept.rawValue) : le nom manque dans « \(dit) »")
            XCTAssertTrue(dit.contains(card.why), "\(card.concept.rawValue) : le « à quoi ça sert » manque dans « \(dit) »")
        }
        let source = try? String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Game/ProgressionConceptViews.swift"), encoding: .utf8)
        for etage in ["ProgressionConceptChips(items: card.chips", "Text(card.why)", "Text(card.how)"] {
            XCTAssertTrue(source?.contains(etage) ?? false, "la carte ne rend pas « \(etage) »")
        }
    }

    func test_anOldServerWithoutTheBlock_keepsTheLinesOfBefore_andNothingOfTheGame() async {
        let sans = APIEngagementProgress(
            counters: [], milestones: [], streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: 36),
            meesh: GameFixture.meesh()
        )
        let vm = await loadedViewModel(sans)

        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers

        XCTAssertFalse(identifiants.contains { $0.hasPrefix("game.") }, "du jeu est monté sans que la passerelle serve le bloc : \(identifiants)")
        XCTAssertTrue(identifiants.contains("progression.meesh.entry"), "le compteur de Meeshes d'avant reste dans l'en-tête : \(identifiants)")
        for concept in [ProgressionConcept.level, .meesh, .flame, .elans, .badges, .defis, .succes] {
            XCTAssertTrue(identifiants.contains("progression.concept.\(concept.rawValue)"), "la carte « \(concept.rawValue) » doit rester : \(identifiants)")
        }
        for concept in [ProgressionConcept.points, .glory, .missions, .league, .season, .prestige, .showcase, .atlas] {
            XCTAssertFalse(identifiants.contains("progression.concept.\(concept.rawValue)"), "« \(concept.rawValue) » n'est pas servi : pas de carte")
        }
    }

    // MARK: - Les fiches : les gestes y vivent

    func test_theMissionsSheet_carriesTheMissionsAndTheChest() async {
        let vm = await loadedViewModel(GameFixture.snapshot(fullGame()))

        let identifiants = monter(ProgressionConceptPage(concept: .missions, viewModel: vm)).identifiers

        for attendu in ["progression.concept.hero", "game.mission.m1", "game.chest.ready"] {
            XCTAssertTrue(identifiants.contains(attendu), "« \(attendu) » n'est pas dans la fiche des missions. Vus : \(identifiants)")
        }
    }

    /// Le héro de frappe — le SEUL du jeu (#9537) — vit dans la fiche des Meeshes.
    func test_theMeeshSheet_carriesTheOnlyMintHero() async {
        let vm = await loadedViewModel(GameFixture.snapshot(fullGame()))

        let identifiants = monter(ProgressionConceptPage(concept: .meesh, viewModel: vm)).identifiers

        for attendu in ["game.mint.hero", "game.mint.info", "game.mint.action"] {
            XCTAssertTrue(identifiants.contains(attendu), "« \(attendu) » n'est pas dans la fiche des Meeshes. Vus : \(identifiants)")
        }
        // Le compte des identifiants dépend de la façon dont le harnais lit l'arbre : l'unicité se garde par la SOURCE.
        XCTAssertEqual(try? sourceCount(of: "GameMintPreviewView("), 1, "UNE seule section Héro de frappe")
        XCTAssertEqual(try? sourceCount(of: "\"game.mint.minting\" : \"game.mint.action\""), 1, "UN seul bouton de frappe")
    }

    func test_theMintHeroSaysHowManyPointsAreMissing_insteadOfAGreyedButton() async {
        let poor = GameFixture.game(score: 400, debitable: 400, held: 0)
        let vm = await loadedViewModel(GameFixture.snapshot(poor, meesh: GameFixture.meesh(balance: 0, minted: 0, debitable: 400)))

        let identifiants = monter(ProgressionConceptPage(concept: .meesh, viewModel: vm)).identifiers

        XCTAssertTrue(identifiants.contains("game.mint.missing"), "« Encore N points » : une phrase lisible à la place du bouton")
        XCTAssertFalse(identifiants.contains("game.mint.action"), "un bouton grisé : la directive est « sinon pas de bouton »")
    }

    func test_theLevelSheet_carriesTheHero_withOneChipPerFamily() async {
        let vm = await loadedViewModel(GameFixture.snapshot(fullGame()))

        let identifiants = monter(ProgressionConceptPage(concept: .level, viewModel: vm)).identifiers

        for attendu in ["game.hero"] + EngagementAxisFamily.allCases.map({ "game.hero.earn.\($0.rawValue)" }) {
            XCTAssertTrue(identifiants.contains(attendu), "« \(attendu) » n'est pas dans la fiche du niveau. Vus : \(identifiants)")
        }
        XCTAssertFalse(identifiants.contains { $0.hasPrefix("game.hero.mint") }, "le doublon du héro de niveau a disparu : \(identifiants)")
    }

    func test_theFlameSheet_carriesTheFreeze_andTheRelightOnlyForAnExtinguishedFlame() async {
        let lit = await loadedViewModel(GameFixture.snapshot(GameFixture.game(flameStatus: .lit)))
        let vus = monter(ProgressionConceptPage(concept: .flame, viewModel: lit)).identifiers
        XCTAssertTrue(vus.contains("game.flame.freeze.buy"), "le gel se prend dans la fiche de la Flamme. Vus : \(vus)")
        XCTAssertFalse(vus.contains("game.flame.relight"))

        ecran?.dismount()
        let out = GameFixture.game(held: 5, flameDays: 0, flameStatus: .out, canRelight: true)
        let vm = await loadedViewModel(GameFixture.snapshot(out, meesh: GameFixture.meesh(balance: 5)))
        let identifiants = monter(ProgressionConceptPage(concept: .flame, viewModel: vm)).identifiers
        XCTAssertTrue(identifiants.contains("game.flame.relight"))
    }

    func test_theLeagueSheet_carriesItsDetail_andTheDoorToTheRanking() async {
        let vm = await loadedViewModel(GameFixture.snapshot(fullGame()))

        let identifiants = monter(ProgressionConceptPage(concept: .league, viewModel: vm)).identifiers

        for attendu in ["game.league.detail", "progression.concept.link.page.league"] {
            XCTAssertTrue(identifiants.contains(attendu), "« \(attendu) » n'est pas dans la fiche de la Ligue. Vus : \(identifiants)")
        }
    }

    /// Chaque concept servi a SA fiche : le héros (ou le héro de niveau) y est monté, quel que soit le concept.
    func test_everyServedConcept_hasItsSheet() async {
        let game = fullGame()
        let vm = await loadedViewModel(GameFixture.snapshot(game))
        let progress = EngagementProgressResolver.resolve(GameFixture.snapshot(game))

        for concept in ProgressionConcepts.served(for: progress, game: game) {
            let identifiants = monter(ProgressionConceptPage(concept: concept, viewModel: vm)).identifiers
            let heros = concept == .level ? "game.hero" : "progression.concept.hero"
            XCTAssertTrue(identifiants.contains(heros), "\(concept.rawValue) : sa fiche n'a pas de héros. Vus : \(identifiants)")
            ecran?.dismount()
        }
    }

    func test_anOldServer_keepsTheMintInTheMeeshSheet() async {
        let sans = APIEngagementProgress(
            counters: [], milestones: [], streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: 36),
            meesh: GameFixture.meesh()
        )
        let vm = await loadedViewModel(sans)

        let identifiants = monter(ProgressionConceptPage(concept: .meesh, viewModel: vm)).identifiers

        XCTAssertTrue(identifiants.contains("progression.concept.hero"), "la fiche des Meeshes garde son héros : \(identifiants)")
        XCTAssertFalse(identifiants.contains { $0.hasPrefix("game.") && !$0.hasPrefix("game.element.") },
                       "du jeu est monté sans le bloc : \(identifiants)")
    }

    // MARK: - Le tableau de bord : un bloc par concept, lecture seule

    func test_theDashboard_carriesOneBlockPerServedConcept_andNoGesture() async {
        let vm = await loadedViewModel(GameFixture.snapshot(fullGame()))

        let identifiants = monter(ProgressionDashboardPage(viewModel: vm)).identifiers

        XCTAssertEqual(Set(identifiants.filter { $0.hasPrefix("progression.dashboard.") }),
                       Set(ProgressionConcept.allCases.map { "progression.dashboard.\($0.rawValue)" }),
                       "un bloc par concept servi, ni plus ni moins. Vus : \(identifiants)")
        for geste in Self.gestures {
            XCTAssertFalse(identifiants.contains(geste), "« \(geste) » est au tableau de bord : il est en lecture seule")
        }
    }
}
