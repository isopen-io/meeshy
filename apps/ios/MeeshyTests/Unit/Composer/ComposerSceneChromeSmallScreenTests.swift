import XCTest
import SwiftUI
@testable import Meeshy

/// #14500 — **sur un iPhone SE (375 × 667 pt) et un 13 mini (375 × 812 pt),
/// aucun rail du composer ne recouvre une zone de contrôle ni ne sort de
/// l'écran.**
///
/// Le chrome RÉEL (`ComposerSceneOverlayChrome`) est rendu par `RenderedScreen`
/// à la taille de l'écran, au-dessus d'un socle qui réserve la hauteur mesurée
/// sur le simulateur SE (Public · Publier de 621 à 665 pt, soit 46 pt). Les
/// rectangles se lisent dans l'arbre d'accessibilité rendu, par les
/// identifiants que la recette lit aussi : la propriété se mesure au point,
/// jamais dans le texte d'un modificateur.
///
/// Les cas sont les pires de chaque rail : le post à deux diapos (la colonne
/// la plus haute, dix boutons dont « Texte du post », sous la rangée des
/// diapos, ↶ et ↷ montés) et le fond média, dont le rail d'édition porte le
/// plus d'entrées et doit défiler dans sa colonne.
@MainActor
final class ComposerSceneChromeSmallScreenTests: XCTestCase {

    private static let iPhoneSE = CGSize(width: 375, height: 667)
    private static let iPhone13mini = CGSize(width: 375, height: 812)
    private static let smallScreens = [iPhoneSE, iPhone13mini]
    private static let socleReserve: CGFloat = 46

    private struct Harness: View {
        let chrome: ComposerSceneOverlayChrome
        let size: CGSize
        var body: some View {
            chrome
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .composerFloatingSocle {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: ComposerSceneChromeSmallScreenTests.socleReserve)
                        .accessibilityElement()
                        .accessibilityLabel(Text("socle"))
                        .accessibilityIdentifier("test.socle")
                }
                .frame(width: size.width, height: size.height)
                .ignoresSafeArea()
        }
    }

    private static let rest = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                                       bottomPanelIsOpen: false, timelineIsOpen: false)

    private static func selected() -> ComposerRestChrome.State {
        var state = rest
        state.objectIsSelected = true
        return state
    }

    private static func slides() -> AnyView {
        AnyView(Color.clear.frame(maxWidth: .infinity).frame(height: 44)
            .accessibilityElement()
            .accessibilityLabel(Text("diapos"))
            .accessibilityIdentifier("test.slides"))
    }

    private static func moreMenu() -> AnyView {
        AnyView(ComposerSceneRoundGlyph(symbol: ComposerRestTool.more.symbol)
            .accessibilityElement()
            .accessibilityLabel(Text("plus"))
            .accessibilityIdentifier("composer.rest.more"))
    }

    private static func postAtTwoSlides(state: ComposerRestChrome.State = rest,
                                        selection: ComposerSelectionColumn? = nil) -> ComposerSceneOverlayChrome {
        ComposerSceneOverlayChrome(state: state, slideRow: slides(), slideCount: 2,
                                   onClose: {}, onUndo: {}, onRedo: {},
                                   tools: ComposerRestTool.allCases, onTool: { _ in },
                                   moreMenu: moreMenu(), selection: selection)
    }

    private static let controls = ["composer.close", "composer.history.undo", "composer.history.redo", "test.socle"]

    private func assertClearOfControls(_ rails: [String], on screen: RenderedScreen, size: CGSize,
                                       file: StaticString = #filePath, line: UInt = #line) throws {
        let bounds = CGRect(origin: .zero, size: size)
        let zones = Self.controls.compactMap { id in screen.node(id).map { (id, $0.frame) } }
        for rail in rails {
            let frame = try XCTUnwrap(screen.frame(of: rail), "\(size) : \(rail) introuvable dans l'arbre rendu",
                                      file: file, line: line)
            XCTAssertTrue(bounds.contains(frame.insetBy(dx: 0.5, dy: 0.5)),
                          "\(size) : \(rail) sort de l'écran : \(frame)", file: file, line: line)
            for (control, zone) in zones {
                XCTAssertFalse(frame.insetBy(dx: 0.5, dy: 0.5).intersects(zone),
                               "\(size) : \(rail) \(frame) recouvre \(control) \(zone)", file: file, line: line)
            }
        }
    }

    func test_auRepos_lePostADeuxDiapos_neCroiseAucuneZoneDeControle() throws {
        let tools = ComposerRestTool.allCases.map { "composer.rest.\($0.rawValue)" }
        for size in Self.smallScreens {
            let screen = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(), size: size), size: size)
            defer { screen.dismount() }

            for control in Self.controls {
                XCTAssertNotNil(screen.frame(of: control), "\(size) : \(control) absent, le témoin ne mesurerait rien.")
            }
            try assertClearOfControls(tools + ["test.slides"], on: screen, size: size)
        }
    }

    func test_auRepos_lesBoutonsDeLaColonne_gardentLeurCibleDe44Points() throws {
        let screen = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(), size: Self.iPhoneSE), size: Self.iPhoneSE)
        defer { screen.dismount() }

        for tool in ComposerRestTool.allCases {
            let frame = try XCTUnwrap(screen.frame(of: "composer.rest.\(tool.rawValue)"), "\(tool) introuvable")
            XCTAssertGreaterThanOrEqual(min(frame.width, frame.height), 44 - 0.5,
                                        "\(tool) : cible sous 44 pt sur le SE (\(frame)).")
        }
    }

    func test_leRailDuFondMedia_resteDansSaColonne_auDessusDuSocle() throws {
        let items = ComposerEditRailItems.items(for: .background, actions: [],
                                                backgroundActions: ComposerBackgroundEditAction.allCases,
                                                sections: [], extras: [], keyframes: false,
                                                backgroundEntries: ComposerBackgroundModifyEntry.allCases)
        let column = ComposerSelectionColumn(level: .background, items: items, onItem: { _ in })

        XCTAssertGreaterThan(items.count, 10, "Le cas doit être celui qui déborde la hauteur du SE.")
        for size in Self.smallScreens {
            let chrome = Self.postAtTwoSlides(state: Self.selected(), selection: column)
            let screen = RenderedScreen(Harness(chrome: chrome, size: size), size: size)
            defer { screen.dismount() }

            try assertClearOfControls(["composer.selection.column"], on: screen, size: size)
        }
    }

    func test_lesActionsDUnObjet_restentDansLEcran_sousLHistorique() throws {
        let items = ComposerEditRailItems.items(for: .actions, actions: ComposerSelectionAction.allCases,
                                                sections: [], extras: [], keyframes: false)
        let column = ComposerSelectionColumn(level: .actions, items: items, onItem: { _ in })
        let entries = items.map { "composer.selection.\($0.identifier)" }
        for size in Self.smallScreens {
            let chrome = Self.postAtTwoSlides(state: Self.selected(), selection: column)
            let screen = RenderedScreen(Harness(chrome: chrome, size: size), size: size)
            defer { screen.dismount() }

            try assertClearOfControls(["composer.selection.column"] + entries, on: screen, size: size)
        }
    }
}
