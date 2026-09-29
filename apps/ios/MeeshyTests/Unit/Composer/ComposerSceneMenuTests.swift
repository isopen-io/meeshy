import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le menu d'appui long de la scène, en verre** (#8717 — directive porteur
/// 2026-09-29 : « le menu du longpress, que ce soit sur n'importe quel objet,
/// doit être Liquid Glass, ou adaptatif Liquid Glass si pas sur iOS 26 »).
final class ComposerSceneMenuTests: XCTestCase {

    private let ecran = CGSize(width: 402, height: 874)
    private let menu = CGSize(width: 250, height: 200)

    // MARK: - Les entrées : les inventaires existants, jamais une liste de plus

    func test_entries_objet_reprendLesActionsDuSDK_dansLeurOrdre() {
        let entrees = ComposerSceneMenu.entries(objectActions: [.edit, .duplicate, .delete])
        XCTAssertEqual(entrees, [.object(.edit), .object(.duplicate), .object(.delete)])
        XCTAssertEqual(entrees.filter(\.isDestructive), [.object(.delete)])
    }

    func test_entries_fond_reprendLeMenuDuFond() {
        let entrees = ComposerSceneMenu.entries(backgroundActions: ComposerBackgroundMenuAction.served)
        XCTAssertEqual(entrees.map(\.id), ComposerBackgroundMenuAction.served.map { "background.\($0.rawValue)" })
        XCTAssertEqual(entrees.filter(\.isDestructive), [.background(.delete)])
    }

    func test_entries_texteReel_composeLaPolitiqueDuRail() {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "t1", text: "salut")]
        let actions = ComposerTrailingRailPolicy.actions(slide: StorySlide(id: "s", effects: effets),
                                                         selectedId: "t1",
                                                         served: ComposerTrailingColumn.servedActions,
                                                         hasEditor: true, canLeaveScene: false)
        let entrees = ComposerSceneMenu.entries(objectActions: actions)
        XCTAssertEqual(entrees.first, .object(.edit))
        XCTAssertEqual(entrees.last, .object(.delete), "la destruction se range en dernier")
    }

    // MARK: - La place : sous le doigt, dans l'écran

    func test_frame_doigtAuCentre_menuSousLeDoigt() {
        let cadre = ComposerSceneMenu.frame(anchor: CGPoint(x: 201, y: 300), menu: menu,
                                            container: ecran, margin: 12)
        XCTAssertEqual(cadre.midX, 201, accuracy: 0.5)
        XCTAssertGreaterThan(cadre.minY, 300, "le menu ne couvre pas l'objet touché")
    }

    func test_frame_doigtEnBas_menuAuDessus() {
        let cadre = ComposerSceneMenu.frame(anchor: CGPoint(x: 201, y: 800), menu: menu,
                                            container: ecran, margin: 12)
        XCTAssertLessThan(cadre.maxY, 800)
    }

    func test_frame_doigtAuBord_resteDansLEcran() {
        for ancre in [CGPoint(x: 0, y: 0), CGPoint(x: 402, y: 874), CGPoint(x: 395, y: 20)] {
            let cadre = ComposerSceneMenu.frame(anchor: ancre, menu: menu, container: ecran, margin: 12)
            XCTAssertGreaterThanOrEqual(cadre.minX, 12)
            XCTAssertLessThanOrEqual(cadre.maxX, ecran.width - 12)
            XCTAssertGreaterThanOrEqual(cadre.minY, 12)
            XCTAssertLessThanOrEqual(cadre.maxY, ecran.height - 12)
        }
    }

    func test_screenPoint_rapporteLePointNormaliseALaCarte() {
        let point = ComposerSceneMenu.screenPoint(CGPoint(x: 0.5, y: 0.25),
                                                  card: CGRect(x: 10, y: 100, width: 380, height: 640))
        XCTAssertEqual(point, CGPoint(x: 200, y: 260))
    }

    // MARK: - Le câblage : du verre, et plus aucun menu système

    func test_leMenu_estPeintParAdaptiveGlass() throws {
        let code = try AppSourceGuard.unit("Meeshy/Features/Main/Composer/ComposerSceneMenu.swift")
        XCTAssertTrue(AppSourceGuard.stripComments(code).contains(".adaptiveGlass(in: RoundedRectangle(cornerRadius: 20"),
                      "le verre du menu passe par l'unique implémentation du dépôt")
        XCTAssertTrue(code.contains(".accessibilityAction(.escape)"), "VoiceOver doit pouvoir le refermer")
    }

    func test_leFond_nePresentePlusDeDialogueSysteme() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/MeeshyComposerHost+BackgroundMenu.swift"))
        XCTAssertFalse(code.contains(".confirmationDialog("))
        XCTAssertTrue(code.contains("sceneMenuLayer("))
    }

    func test_laSurface_remetLAppuiLongAuMeuble() throws {
        let surface = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift"))
        XCTAssertTrue(surface.contains("onItemMenuRequested: onItemMenu"),
                      "le canvas doit remettre l'appui long au meuble, sans quoi le UIMenu système revient")
        XCTAssertTrue(surface.contains("onItemMenu?(son.id, .audio"),
                      "une puce sonore ouvre le même menu")
    }
}
