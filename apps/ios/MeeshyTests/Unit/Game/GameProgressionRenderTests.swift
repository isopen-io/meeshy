import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// **Ce que l'utilisateur VOIT, pas ce que le code déclare** (#9383) — le jeu est RENDU
/// sur Progression quand la passerelle sert le bloc, et ABSENT devant un ancien serveur.
/// Une vue écrite et montée par personne ne fait rougir aucun compilateur.
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
        let e = RenderedScreen(vue, size: CGSize(width: 402, height: 4200))
        ecran = e
        return e
    }

    func test_theGameIsMountedOnProgression_whenTheServerServesTheBlock() async {
        let vm = await loadedViewModel(GameFixture.snapshot(GameFixture.game(chestStatus: .ready)))
        XCTAssertNotNil(vm.game, "le modèle n'a pas le bloc : ce n'est pas la vue qui est en cause")

        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers

        for attendu in ["game.guide.card", "game.mission.m1", "game.chest.ready", "game.mint.action", "game.flame.freeze.buy", "game.door.rules", "game.door.notebook"] {
            XCTAssertTrue(identifiants.contains(attendu), "« \(attendu) » n'est pas dans l'arbre rendu. Vus : \(identifiants)")
        }
    }

    /// Le héro (#5841) : pleine largeur, une puce par famille. Et le héro de frappe — le SEUL (#9537) — avec sa porte.
    func test_theHeroIsMounted_withOneChipPerFamily_andTheOnlyMintHero() async {
        let vm = await loadedViewModel(GameFixture.snapshot(GameFixture.game(chestStatus: .ready)))

        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers

        for attendu in ["game.hero", "game.mint.hero", "game.mint.info"] + EngagementAxisFamily.allCases.map({ "game.hero.earn.\($0.rawValue)" }) {
            XCTAssertTrue(identifiants.contains(attendu), "« \(attendu) » n'est pas dans l'arbre rendu. Vus : \(identifiants)")
        }
        // Le compte des identifiants dépend de la façon dont le harnais lit l'arbre (un même élément peut y paraître
        // deux fois) : l'unicité se garde par la SOURCE.
        XCTAssertEqual(try? sourceCount(of: "GameMintPreviewView("), 1, "UNE seule section Héro de frappe")
        XCTAssertEqual(try? sourceCount(of: ": \"game.mint.action\""), 1, "UN seul bouton de frappe sur l'écran")
        XCTAssertFalse(identifiants.contains { $0.hasPrefix("game.hero.mint") }, "le doublon du héro de niveau a disparu : \(identifiants)")
    }

    func test_theMintHeroSaysHowManyPointsAreMissing_insteadOfAGreyedButton() async {
        let poor = GameFixture.game(score: 400, debitable: 400, held: 0)
        let vm = await loadedViewModel(GameFixture.snapshot(poor, meesh: GameFixture.meesh(balance: 0, minted: 0, debitable: 400)))

        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers

        XCTAssertTrue(identifiants.contains("game.mint.missing"), "« Encore N points » : une phrase lisible à la place du bouton")
        XCTAssertFalse(identifiants.contains("game.mint.action"), "un bouton grisé : la directive est « sinon pas de bouton »")
    }

    func test_anOldServerWithoutTheBlock_leavesTheScreenAsItWas() async {
        let sans = APIEngagementProgress(
            counters: [], milestones: [], streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: 36),
            meesh: GameFixture.meesh()
        )
        let vm = await loadedViewModel(sans)

        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers

        XCTAssertFalse(identifiants.contains { $0.hasPrefix("game.") }, "du jeu est monté sans que la passerelle serve le bloc : \(identifiants)")
        XCTAssertTrue(identifiants.contains("progression.meesh.entry"), "l'écran d'avant doit rester intact")
    }

    func test_theMintButtonIsAbsent_whenThePointsDoNotAllowIt() async {
        let poor = GameFixture.game(score: 400, debitable: 400, held: 0)
        let vm = await loadedViewModel(GameFixture.snapshot(poor, meesh: GameFixture.meesh(balance: 0, minted: 0, debitable: 400)))

        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers

        XCTAssertFalse(identifiants.contains("game.mint.action"), "un bouton de frappe grisé : la directive est « sinon pas de bouton »")
    }

    func test_theRelightButtonIsMounted_onlyForAnExtinguishedFlameThatCanBeRelit() async {
        let out = GameFixture.game(held: 5, flameDays: 0, flameStatus: .out, canRelight: true)
        let vm = await loadedViewModel(GameFixture.snapshot(out, meesh: GameFixture.meesh(balance: 5)))
        let identifiants = monter(ProgressionView(viewModel: vm)).identifiers
        XCTAssertTrue(identifiants.contains("game.flame.relight"))

        ecran?.dismount()
        let lit = await loadedViewModel(GameFixture.snapshot(GameFixture.game(flameStatus: .lit)))
        let vus = monter(ProgressionView(viewModel: lit)).identifiers
        XCTAssertFalse(vus.contains("game.flame.relight"))
    }
}
