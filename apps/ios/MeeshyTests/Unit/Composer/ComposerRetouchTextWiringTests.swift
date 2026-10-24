import XCTest
@testable import Meeshy

/// #12591 — **un seul éditeur de texte** : la retouche monte le canvas et la barre du composer,
/// sans « Langue » ni fond « Verre », et rien d'autre. Une garde de source : la couche est une vue
/// SwiftUI qu'un test unitaire ne monte pas.
final class ComposerRetouchTextWiringTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_theLayer_mountsTheComposerCanvasAndToolbar_withTheBakedProfile() throws {
        let code = try source("ComposerEditTextLayer.swift")
        XCTAssertTrue(code.contains("StoryComposerCanvasView("))
        XCTAssertTrue(code.contains("StoryTextEditToolbar(viewModel:board.scene"))
        XCTAssertTrue(code.contains("profile:.bakedIntoMedia"), "ni « Langue » ni fond « Verre » sur un texte cuit")
        XCTAssertTrue(code.contains("paintsSceneBackground:false"), "le canvas est transparent : le média se voit à travers")
        XCTAssertFalse(code.contains(".language"))
    }

    func test_noSecondTextEditor_isMountedByTheRetouche() throws {
        let code = try source("ComposerEditTextLayer.swift") + (try source("ComposerRetouchTextBoard.swift"))
        for interdit in ["TextEditor(", "TextField(", "UITextView", "MeeshyImageEditorView"] {
            XCTAssertFalse(code.contains(interdit), "\(interdit) : la saisie est celle du canvas du composer")
        }
    }

    func test_theChrome_mountsTheTextLayer_belowTheRows() throws {
        let code = try source("ComposerCaptureViews.swift")
        let couche = try XCTUnwrap(code.range(of: "ComposerEditTextLayer(session:session,board:session.retouchTexts)"))
        let rangees = try XCTUnwrap(code.range(of: "VStack(spacing:0){"))
        XCTAssertLessThan(couche.lowerBound, rangees.lowerBound,
                          "sous les rangées : le canvas ne doit pas avaler les touches des outils")
    }

    func test_bothRenders_bakeTheOverlayAtTheOutputCanvas() throws {
        let code = try source("ComposerCaptureSession+Edit.swift")
        XCTAssertTrue(code.contains("overlay:calque"))
        XCTAssertTrue(code.contains("textes.overlay(canvas:"))
        XCTAssertTrue(code.contains("retouchTexts.overlay(canvas:"))
        XCTAssertTrue(code.contains("!textes.isEmpty"), "le raccourci « la prise repart telle quelle » tient compte du texte")
    }
}
