import XCTest
@testable import Meeshy

/// **Le clavier matériel du compositeur** (#13839, L6, spec iOS § 2.5) : Échap referme ce qui est ouvert, du plus
/// proche au plus large — la feuille, puis l'outil, puis la sélection — et ne demande la fermeture du compositeur
/// (avec sa confirmation de brouillon) qu'au repos. Retour valide OK. Les libellés du ⌘ sont localisés.
final class ComposerHardwareKeysTests: XCTestCase {

    private func escape(sheet: Bool = false, camera: Bool = false, tool: Bool = false,
                        selection: Bool = false) -> ComposerHardwareKeys.Escape {
        ComposerHardwareKeys.escape(sheetIsOpen: sheet, cameraIsArmed: camera, toolIsOpen: tool,
                                    objectIsSelected: selection)
    }

    func test_escape_withASheetOpen_closesTheSheetFirst() {
        XCTAssertEqual(escape(sheet: true, tool: true, selection: true), .closeSheet)
    }

    func test_escape_atTheViewfinder_returnsToTheScene_neverClosesTheComposer() {
        XCTAssertEqual(escape(camera: true), .leaveViewfinder,
                       "Échap au viseur fait ce que fait « Revenir à la scène », jamais la fermeture du compositeur")
        XCTAssertEqual(escape(camera: true, selection: true), .leaveViewfinder)
        XCTAssertEqual(escape(sheet: true, camera: true), .closeSheet)
    }

    func test_host_escapeAtTheViewfinder_disarmsTheCamera() throws {
        let relais = try ComposerSceneArrangementTests.source("ComposerSceneArrangementRelay.swift")
        XCTAssertTrue(relais.contains("case .leaveViewfinder: host.disarmSceneCamera()"))
        XCTAssertTrue(relais.contains("cameraIsArmed: host.sceneCameraStage != .off"))
    }

    func test_escape_withAToolOpen_endsTheTool() {
        XCTAssertEqual(escape(tool: true, selection: true), .endTool)
    }

    func test_escape_withASelection_deselects() {
        XCTAssertEqual(escape(selection: true), .deselect)
    }

    func test_escape_atRest_asksToCloseTheComposer() {
        XCTAssertEqual(escape(), .close)
    }

    func test_copy_shortcutLabelsAreLocalised() {
        XCTAssertFalse(ComposerHardwareKeysCopy.escape.isEmpty)
    }

    func test_host_mountsEscape_asACancelShortcut_withoutAFocusedValue() throws {
        let host = try ComposerSceneArrangementTests.source("ComposerSceneArrangementRelay.swift")
        XCTAssertTrue(host.contains(".keyboardShortcut(.cancelAction)"))
        XCTAssertFalse(host.contains("focusedValue"), "une focusedValue à fermeture neuve fige l'app (#11239)")
    }

    func test_anchoredSheet_okAnswersReturn() throws {
        let sheet = try ComposerSceneArrangementTests.source("ComposerAnchoredSheet.swift")
        XCTAssertTrue(sheet.contains(".keyboardShortcut(.defaultAction)"))
    }
}
