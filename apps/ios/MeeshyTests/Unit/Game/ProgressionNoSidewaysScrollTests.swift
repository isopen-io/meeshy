import XCTest
import SwiftUI
import UIKit
@testable import Meeshy
import MeeshySDK

/// **Aucune page de Progression ne glisse de côté** (#9564, amendement n° 3) — ni la page, ni une rangée à
/// l'intérieur. Trois instruments, parce qu'aucun ne voit tout :
///
///  - la LARGEUR QUE LE CONTENU RÉCLAME à 320 pt (`sizeThatFits`) : un élément qui garde sa largeur de force
///    élargit tout ce qui le contient — c'est le défaut qu'un `fixedSize()` sur une pastille avait produit ;
///  - les CADRES RENDUS : rien de ce que l'écran expose ne sort de la fenêtre ;
///  - la SOURCE : aucun défilement horizontal, aucune largeur forcée dans les fichiers des pages.
///
/// Les valeurs sont LONGUES (niveau 100, grands nombres, ligue au nom le plus long, record et Vent arrière), et
/// une pastille de deux cents caractères éprouve la règle pour TOUTE langue : si aucune longueur ne déborde,
/// l'allemand ne déborde pas non plus.
@MainActor
final class ProgressionNoSidewaysScrollTests: XCTestCase {

    /// 320 pt d'écran, moins les deux marges de page.
    private static let screen: CGFloat = 320
    private static let content: CGFloat = 320 - 2 * 16

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    // MARK: - Les valeurs longues

    private static let longLeague = GameWave2Fixture.league(
        current: .init(league: .amethyste, groupId: "2026-10-12:amethyste:1", groupSize: 30, rank: 30,
                       weekPoints: 9_999_999, zone: .relegation, cup: nil, pointsToPromotion: 9_999_999)
    )

    /// Niveau 100, toutes les extensions servies, la ligue au nom le plus long.
    private static func summit() -> GameBlock {
        let top = GameWave2Fixture.atLevel100(prestige: 4)
        return top.replacing(wave2: GameWave2(
            league: longLeague, duo: top.duo, season: top.season, trophies: top.trophies, atlas: top.atlas,
            prestige: top.prestige, visibility: top.visibility
        ))
    }

    /// Redescendu après des frappes : le record (niveau 100) et le Vent arrière ont chacun leur pastille.
    private static func redescended() -> GameBlock {
        GameFixture.game(score: 12_180, levelRecord: 100, glory: 9_999_999, minted: 99_999, held: 9_999, flameDays: 365, freezes: 2)
            .replacing(wave2: summit().wave2)
    }

    /// Au plafond du rang (#9688) : niveau 499, la phrase dit quel rang ouvre la suite.
    private static func capped() -> GameBlock {
        GameFixture.game(score: GameLevels.threshold(of: 700), glory: 100_000, minted: 99_999, held: 9_999, flameDays: 365)
            .replacing(wave2: summit().wave2)
    }

    /// Un niveau à quatre chiffres, ouvert par le rang Oracle (#9688).
    private static func fourDigits() -> GameBlock {
        GameFixture.game(score: GameLevels.threshold(of: 1_234) + 5, glory: 400_000, minted: 99_999, held: 9_999, flameDays: 365)
            .replacing(wave2: summit().wave2)
    }

    private static var longCases: [(String, GameBlock)] {
        [("au sommet", summit()), ("redescendu", redescended()), ("au plafond du rang", capped()), ("quatre chiffres", fourDigits())]
    }

    private static let richMeesh = GameFixture.meesh(balance: 9_999, minted: 99_999, debitable: 9_999_999)

    private func loadedViewModel(_ game: GameBlock) async -> ProgressionViewModel {
        let service = MockEngagementProgressService()
        service.fetchProgressResult = .success(GameFixture.snapshot(game, meesh: Self.richMeesh))
        let vm = ProgressionViewModel(
            service: service,
            gameService: MockGameService(),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: "no-sideways-\(UUID().uuidString)",
            notebook: MockGamePhotoNotebook()
        )
        await vm.load(forceNetwork: true)
        return vm
    }

    // MARK: - L'instrument

    /// La largeur que la vue RÉCLAME quand on lui en propose `width` : au-delà, elle élargit ce qui la contient.
    private func claimedWidth(_ view: some View, proposing width: CGFloat = ProgressionNoSidewaysScrollTests.content) -> CGFloat {
        let host = UIHostingController(rootView: view)
        return host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).width
    }

    /// **L'instrument doit pouvoir ÉCHOUER** : une largeur forcée se lit au-delà de ce qu'on propose. Sans ce
    /// témoin, les suivants seraient verts devant n'importe quel débordement.
    func test_theInstrument_seesAForcedWidth() {
        let forced = VStack { Text(String(repeating: "W", count: 80)).lineLimit(1).fixedSize() }
        XCTAssertGreaterThan(claimedWidth(forced), Self.content, "l'instrument ne voit pas une largeur forcée : il ne mesure rien")

        let free = VStack { Text(String(repeating: "W", count: 80)).lineLimit(1) }
        XCTAssertLessThanOrEqual(claimedWidth(free), Self.content + 0.5)
    }

    // MARK: - La largeur réclamée, avec des valeurs longues

    func test_theFrontPage_claimsNoMoreThanTheScreen() async {
        for (label, game) in Self.longCases {
            let vm = await loadedViewModel(game)
            guard let progress = vm.progress else { return XCTFail("pas de progression chargée") }
            let list = ProgressionFrontList(
                viewModel: vm, guide: vm.guide, photos: vm.photos, progress: progress,
                onOpenConcept: { _ in }, onOpenConversations: {}, onOpenRules: { _ in },
                onOpenNotebook: {}, onOpenPage: { _ in }
            )
            XCTAssertLessThanOrEqual(claimedWidth(list), Self.content + 0.5, "la première page (\(label)) dépasse l'écran à 320 pt")
        }
    }

    func test_everySheet_claimsNoMoreThanTheScreen() async {
        for (label, game) in Self.longCases {
            let vm = await loadedViewModel(game)
            guard let progress = vm.progress else { return XCTFail("pas de progression chargée") }
            for concept in ProgressionConcepts.served(for: progress, game: game) {
                let sheet = ProgressionConceptContent(
                    concept: concept, viewModel: vm, photos: vm.photos, progress: progress, isDark: false,
                    onOpenLink: { _ in }, onReveal: { _ in }
                )
                XCTAssertLessThanOrEqual(claimedWidth(sheet), Self.content + 0.5,
                                         "la fiche « \(concept.rawValue) » (\(label)) dépasse l'écran à 320 pt")
            }
        }
    }

    func test_theChallengeRows_wrapInAGrid_andClaimNoMoreThanTheScreen() async {
        let vm = await loadedViewModel(Self.summit())
        guard let progress = vm.progress else { return XCTFail("pas de progression chargée") }
        XCTAssertFalse(progress.achievementSections.isEmpty, "le témoin veut des rangées de paliers")

        let rows = ProgressionGeneratedAchievements(sections: progress.achievementSections)

        XCTAssertLessThanOrEqual(claimedWidth(rows), Self.content + 0.5, "les rangées de la page Défis dépassent l'écran à 320 pt")
    }

    // MARK: - Les cadres rendus

    func test_nothingRenderedOnTheFrontPage_leavesTheScreen() async {
        let vm = await loadedViewModel(Self.redescended())
        let rendu = RenderedScreen(ProgressionView(viewModel: vm), size: CGSize(width: Self.screen, height: 6400))
        ecran = rendu

        let hors = rendu.nodes.filter { $0.frame.width > 0 && ($0.frame.minX < -0.5 || $0.frame.maxX > Self.screen + 0.5) }

        XCTAssertFalse(rendu.nodes.isEmpty, "l'arbre est muet : le témoin ne prouverait rien")
        XCTAssertTrue(hors.isEmpty, "des éléments sortent de l'écran à 320 pt : \(hors.map { "\($0.identifier ?? $0.label ?? "?") \($0.frame)" })")
    }

    /// Une pastille plus longue que sa rangée RÉTRÉCIT puis se tronque : elle ne garde jamais sa largeur de force.
    func test_aChipLongerThanItsRow_staysInsideTheRow() {
        let long = String(repeating: "Sehr lange Bezeichnung ", count: 9)
        let row = FlowLayout(spacing: 4) {
            GameChip(text: "Court")
            GameChip(text: long).accessibilityIdentifier("chip.long")
        }
        .frame(width: Self.content)
        let rendu = RenderedScreen(row, size: CGSize(width: Self.content, height: 400))
        ecran = rendu

        let frame = rendu.frame(of: "chip.long")

        XCTAssertNotNil(frame, "la pastille longue n'est pas dans l'arbre rendu")
        XCTAssertLessThanOrEqual(frame?.width ?? .infinity, Self.content + 0.5, "une pastille plus longue que sa rangée déborde")
        XCTAssertGreaterThanOrEqual(frame?.minX ?? -1, -0.5)
    }

    func test_theFlowLayout_capsAnItemToItsRow_andLeavesTheOthersAlone() {
        XCTAssertEqual(FlowLayout.proposal(ideal: CGSize(width: 400, height: 20), rowWidth: 288), ProposedViewSize(width: 288, height: nil))
        XCTAssertEqual(FlowLayout.proposal(ideal: CGSize(width: 120, height: 20), rowWidth: 288), .unspecified,
                       "un élément qui tient dans la rangée garde sa taille idéale")
        XCTAssertEqual(FlowLayout.proposal(ideal: CGSize(width: 400, height: 20), rowWidth: 0), .unspecified,
                       "sans largeur proposée, rien à borner")
    }

    // MARK: - La source

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    /// Les fichiers des pages de Progression : la première page et ses pièces, les fiches, les
    /// sous-pages de la vague 2, les règles, le carnet. La capture photo du carnet (`Game/Photo`) n'est pas une page.
    private func pageSources() throws -> [(name: String, code: String)] {
        let main = iosRoot.appendingPathComponent("Meeshy/Features/Main")
        let views = try FileManager.default.contentsOfDirectory(at: main.appendingPathComponent("Views"), includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("Progression") && $0.pathExtension == "swift" }
        let game = try FileManager.default.contentsOfDirectory(at: main.appendingPathComponent("Game"), includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        let wave2 = try FileManager.default.contentsOfDirectory(at: main.appendingPathComponent("Game/Wave2"), includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        return try (views + game + wave2).map { url in
            let code = try String(contentsOf: url, encoding: .utf8)
                .components(separatedBy: "\n")
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
            return (url.lastPathComponent, code)
        }
    }

    func test_noProgressionPage_scrollsSideways() throws {
        let sources = try pageSources()
        XCTAssertGreaterThan(sources.count, 40, "les fichiers des pages sont introuvables : la garde ne lirait rien")
        for source in sources {
            for forbidden in ["ScrollView(.horizontal", "ScrollView([", "ScrollView(Axis.Set"] {
                XCTAssertFalse(source.code.contains(forbidden),
                               "\(source.name) : « \(forbidden) » — aucune rangée de Progression ne défile de côté, elle passe à la ligne")
            }
        }
    }

    func test_noProgressionPage_forcesAWidth() throws {
        for source in try pageSources() {
            for forbidden in [".fixedSize()", "fixedSize(horizontal: true"] {
                XCTAssertFalse(source.code.contains(forbidden),
                               "\(source.name) : « \(forbidden) » — un élément qui garde sa largeur de force élargit la page")
            }
        }
    }
}
